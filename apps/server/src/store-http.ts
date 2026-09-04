/**
 * Phase B store HTTP endpoints — /api/platform/store/*
 *
 * Implements the client side of docs/EXTENSION-STORE-PROTOCOL.md §9.
 * Owner-authenticated via the app-wide auth hook (platform prefix).
 * UI entry is intentionally HIDDEN until the next release; endpoints are
 * fully functional for CLI and integration use.
 */

import type { FastifyInstance } from 'fastify'
import type { PlatformContext } from './platform/index.js'
import {
  createStoreClient,
  installFromStore,
  resolveRegistryBase,
} from './platform/store/store-client.js'

export type StoreHttpOptions = {
  platform: PlatformContext
  /** Registry base override (tests inject the local mock). */
  baseUrl?: string
}

export function createStoreClientFor(platform: PlatformContext, baseUrl?: string) {
  void platform
  return createStoreClient({ baseUrl: baseUrl ?? resolveRegistryBase() })
}

export async function registerStoreHttp(
  app: FastifyInstance,
  opts: StoreHttpOptions,
): Promise<void> {
  const { platform, baseUrl } = opts

  // Registry base is deploy config, not a user setting (protocol P2).
  const client = createStoreClientFor(platform, baseUrl)

  app.get<{ Querystring: { q?: string; category?: string; cursor?: string; limit?: string } }>(
    '/api/platform/store/search',
    async (req, reply) => {
      try {
        const result = await client.search({
          ...(req.query.q ? { q: req.query.q } : {}),
          ...(req.query.category ? { category: req.query.category } : {}),
          ...(req.query.cursor ? { cursor: req.query.cursor } : {}),
          ...(req.query.limit ? { limit: Math.min(Number(req.query.limit) || 50, 100) } : {}),
        })
        return result
      } catch (err) {
        const status = (err as { status?: number }).status ?? 502
        return reply.code(status >= 400 && status < 600 ? status : 502).send({
          error: err instanceof Error ? err.message : 'registry unreachable',
        })
      }
    },
  )

  app.get<{ Params: { id: string } }>(
    '/api/platform/store/extensions/:id',
    async (req, reply) => {
      try {
        const detail = await client.detail(req.params.id)
        // Annotate compatibility with this host (advisory; install re-checks).
        return {
          ...detail,
          hostAbi: platform.info().abiVersion,
        }
      } catch (err) {
        const status = (err as { status?: number }).status ?? 502
        return reply.code(status >= 400 && status < 600 ? status : 502).send({
          error: err instanceof Error ? err.message : 'registry unreachable',
        })
      }
    },
  )

  app.post<{ Body: { id?: string; version?: string; autoActivate?: boolean } }>(
    '/api/platform/store/install',
    async (req, reply) => {
      const body = req.body ?? {}
      const id = typeof body.id === 'string' ? body.id.trim() : ''
      if (!id) {
        return reply.code(400).send({ error: 'id required' })
      }
      const result = await installFromStore(platform, client, {
        id,
        ...(typeof body.version === 'string' ? { version: body.version } : {}),
        autoActivate: body.autoActivate !== false,
      })
      if (!result.ok) {
        const status =
          result.code === 'not_found' || result.code === 'revoked'
            ? 404
            : result.code === 'incompatible'
              ? 422
              : result.code === 'registry_unreachable'
                ? 502
                : 400
        return reply.code(status).send({ error: result.error, code: result.code })
      }
      return result
    },
  )

  app.get('/api/platform/store/revocations', async (_req, reply) => {
    try {
      const entries = await client.revocations()
      return { entries }
    } catch (err) {
      const status = (err as { status?: number }).status ?? 502
      return reply.code(status >= 400 && status < 600 ? status : 502).send({
        error: err instanceof Error ? err.message : 'registry unreachable',
      })
    }
  })
}
