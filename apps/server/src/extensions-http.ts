/**
 * Phase A Extensions HTTP API — install/activate/deactivate/uninstall/list.
 *
 * Endpoints:
 *   POST   /api/platform/extensions/install        — upload .opx (raw bytes) → parse → register → activate
 *   POST   /api/platform/extensions/:id/activate
 *   POST   /api/platform/extensions/:id/deactivate
 *   DELETE /api/platform/extensions/:id            — uninstall (+ optional data export)
 *   GET    /api/platform/extensions                — list with state
 *   GET    /api/platform/extensions/:id/storage/export — export Tier 1 data
 *   ANY    /api/ext/:pluginId/*                    — extension route contributions (proxy)
 *
 * Dev mode (OPPTRIX_EXT_DEV=1): skips signature verification (Phase B feature).
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import {
  admitPlatformExtensions,
  admitRegisterOpx,
  admitActivateExtension,
  admitDeactivateExtension,
  removeExtensionData,
  type PlatformContext,
} from './platform/index.js'
import { exportPluginData } from '@opptrix/plugin-storage'
import { invokeRouteHandler } from './platform/extensions/route-contributions.js'

export type ExtensionsHttpOptions = {
  platform: PlatformContext
  /** Dev mode: skip signature verification. */
  devMode?: boolean
}

const OPX_MAX_BYTES = 2 * 1024 * 1024 // mirror OPX_ZIP_MAX_BYTES

export async function registerExtensionsHttp(
  app: FastifyInstance,
  opts: ExtensionsHttpOptions,
): Promise<void> {
  const { platform, devMode = false } = opts

  // .opx upload arrives as raw bytes — register an octet-stream parser (scoped
  // here; Fastify applies the first matching parser per content type).
  app.addContentTypeParser(
    'application/octet-stream',
    { parseAs: 'buffer', bodyLimit: OPX_MAX_BYTES },
    (_req, body, done) => done(null, body as Buffer),
  )

  // ── Install (.opx upload) ─────────────────────────────────────────────────
  app.post<{ Querystring: { activate?: string } }>(
    '/api/platform/extensions/install',
    async (req, reply) => {
      // Body arrives as Buffer via the octet-stream parser registered above.
      const buf = req.body instanceof Buffer ? req.body : null
      if (!buf || buf.length === 0) {
        return reply.code(400).send({ error: 'empty body: send .opx bytes (application/octet-stream)' })
      }
      if (buf.length > OPX_MAX_BYTES) {
        return reply.code(413).send({ error: `.opx exceeds ${OPX_MAX_BYTES} bytes` })
      }

      const regResult = admitRegisterOpx(platform, buf, {
        origin: 'web.install',
        trusted: true, // local install is explicitly user-initiated (SF1)
      })
      if (!regResult.ok) {
        return reply.code(400).send({ error: regResult.error })
      }

      const ext = regResult.extension

      // Auto-activate unless ?activate=false.
      const activate = req.query.activate !== 'false'
      let activation: Awaited<ReturnType<typeof admitActivateExtension>> | null = null
      if (activate) {
        activation = await admitActivateExtension(platform, ext.id, {
          origin: 'web.install',
        })
        if (!activation.ok) {
          return reply.code(500).send({ error: activation.error, id: ext.id })
        }
      }

      return {
        id: ext.id,
        name: ext.name,
        version: ext.version,
        entryPath: regResult.entryPath,
        activated: activate,
        experimental: activation?.experimental === true,
      }
    },
  )

  // ── Activate ──────────────────────────────────────────────────────────────
  app.post<{ Params: { id: string } }>(
    '/api/platform/extensions/:id/activate',
    async (req, reply) => {
      const result = await admitActivateExtension(platform, req.params.id, {
        origin: 'web.api',
      })
      if (!result.ok) {
        return reply.code(400).send({ error: result.error })
      }
      return {
        id: req.params.id,
        ok: true,
        hostBound: result.hostBound,
        jsLoaded: result.jsLoaded,
        experimental: result.experimental === true,
      }
    },
  )

  // ── Deactivate ────────────────────────────────────────────────────────────
  app.post<{ Params: { id: string } }>(
    '/api/platform/extensions/:id/deactivate',
    async (req, reply) => {
      const result = await admitDeactivateExtension(platform, req.params.id, {
        origin: 'web.api',
      })
      if (!result.ok) {
        return reply.code(400).send({ error: result.error })
      }
      return { id: req.params.id, ok: true }
    },
  )

  // ── Uninstall ─────────────────────────────────────────────────────────────
  app.delete<{
    Params: { id: string }
    Querystring: { keepData?: string; exportData?: string }
  }>('/api/platform/extensions/:id', async (req, reply) => {
    const id = req.params.id

    // Optional data export before removal.
    let dataExport: Record<string, unknown> | undefined
    if (req.query.exportData === 'true') {
      try {
        const exp = exportPluginData(id)
        dataExport = exp.kv
      } catch {
        // best-effort
      }
    }

    // Uninstall: deactivate (contribution cleanup) + remove from registry.
    const result = (
      platform.extensions as unknown as {
        uninstall: (id: string) => { ok: boolean; id: string }
      }
    ).uninstall(id)
    if (!result.ok) {
      return reply.code(404).send({ error: 'extension not found', id })
    }

    // Remove private data unless keepData=true.
    if (req.query.keepData !== 'true') {
      removeExtensionData(id)
    }

    return { id, ok: true, exported: dataExport ? true : false }
  })

  // ── List ──────────────────────────────────────────────────────────────────
  app.get('/api/platform/extensions', async (_req, reply) => {
    const result = admitPlatformExtensions(platform)
    if (!result.ok) {
      return reply.code(400).send({ error: result.error })
    }
    return {
      traceId: result.traceId,
      origin: result.origin,
      extensions: result.extensions,
      hostWorker: result.hostWorker,
    }
  })

  // ── Storage export ────────────────────────────────────────────────────────
  app.get<{ Params: { id: string } }>(
    '/api/platform/extensions/:id/storage/export',
    async (req, reply) => {
      try {
        const exp = exportPluginData(req.params.id)
        return { pluginId: exp.pluginId, version: exp.version, kv: exp.kv }
      } catch (err) {
        return reply.code(404).send({
          error: err instanceof Error ? err.message : 'export failed',
        })
      }
    },
  )

  // ── Extension route contributions (proxy) ─────────────────────────────────
  // Matches /api/ext/:pluginId/* and forwards to the extension's registered handler.
  app.route({
    method: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    url: '/api/ext/:pluginId/*',
    handler: async (req, reply) => {
      const routeRegistry = (
        platform.extensions as unknown as {
          getRouteRegistry: () => {
            match: (
              method: string,
              url: string,
            ) => { route: { handle: unknown }; params: Record<string, string> } | null
          }
        }
      ).getRouteRegistry()

      const method = req.method
      const url = (req as FastifyRequest & { url: string }).url
      const matched = routeRegistry.match(method, url)
      if (!matched) {
        return reply.code(404).send({ error: 'no extension route matched' })
      }
      try {
        const response = await invokeRouteHandler(
          matched.route.handle as (req: unknown) => Promise<{
            status: number
            body: unknown
            headers?: Record<string, string>
          }>,
          {
            method,
            path: (req.params as Record<string, string>)['*'] || '',
            query: (req.query as Record<string, string>) || {},
            body: (req as FastifyRequest & { body: unknown }).body,
            headers: (req.headers as Record<string, string>) || {},
          },
        )
        if (response.headers) {
          for (const [k, v] of Object.entries(response.headers)) {
            reply.header(k, v)
          }
        }
        return reply.code(response.status).send(response.body)
      } catch (err) {
        return reply.code(500).send({
          error: err instanceof Error ? err.message : 'extension route error',
        })
      }
    },
  })
}
