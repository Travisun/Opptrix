/**
 * Channels HTTP surface.
 *
 * Owner-managed config:   /api/platform/channels*        (auth hook gates)
 * Public inbound webhook: /api/channels/webhook/:id       (adapter-verified)
 *
 * UI entry intentionally deferred; endpoints are fully functional for CLI,
 * integration tests, and manual setup.
 */

import type { FastifyInstance } from 'fastify'
import type { PlatformContext } from './platform/index.js'
import type { AgentEngine } from '@opptrix/agent'
import { ChannelManager } from './channels/manager.js'
import { channelAdapters } from './channels/adapters.js'
import type { ChannelKind } from './channels/types.js'

export type ChannelsHttpOptions = {
  platform: PlatformContext
  agent: AgentEngine
}

export async function registerChannelsHttp(
  app: FastifyInstance,
  opts: ChannelsHttpOptions,
): Promise<void> {
  const { platform, agent } = opts

  const manager = new ChannelManager({
    chat: (sessionId, message, modelRef, progress, attachmentIds) =>
      agent.chat(sessionId, message, modelRef, progress, attachmentIds),
    createSession: async () => {
      const record = await agent.createSession()
      return { id: record.id }
    },
  })
  // Expose for tests (mock transport injection).
  ;(app as unknown as { __channelManager?: ChannelManager }).__channelManager = manager

  // ── Owner-managed config ──────────────────────────────────────────────────

  app.get('/api/platform/channels', async () => {
    return { channels: manager.list(), kinds: Object.keys(channelAdapters) }
  })

  app.post<{
    Body: {
      id?: string
      kind?: string
      name?: string
      enabled?: boolean
      creds?: Record<string, string>
      model?: string
    }
  }>('/api/platform/channels', async (req, reply) => {
    const body = req.body ?? {}
    const kind = String(body.kind ?? '') as ChannelKind
    if (!(kind in channelAdapters)) {
      return reply.code(400).send({ error: `unknown channel kind: ${kind}` })
    }
    const result = manager.saveConfig({
      ...(typeof body.id === 'string' ? { id: body.id } : {}),
      kind,
      ...(typeof body.name === 'string' ? { name: body.name } : {}),
      ...(typeof body.enabled === 'boolean' ? { enabled: body.enabled } : {}),
      creds: body.creds ?? {},
      ...(typeof body.model === 'string' ? { model: body.model } : {}),
    })
    if (!result.ok) {
      return reply.code(400).send({ error: result.error })
    }
    return { ok: true, id: result.id }
  })

  app.delete<{ Params: { id: string } }>(
    '/api/platform/channels/:id',
    async (req, reply) => {
      const ok = manager.removeConfig(req.params.id)
      if (!ok) return reply.code(404).send({ error: 'channel not found' })
      return { ok: true }
    },
  )

  app.post<{ Params: { id: string }; Body: { enabled?: boolean } }>(
    '/api/platform/channels/:id/enable',
    async (req, reply) => {
      const enabled = req.body?.enabled !== false
      const ok = manager.setEnabled(req.params.id, enabled)
      if (!ok) return reply.code(404).send({ error: 'channel not found' })
      return { ok: true, enabled }
    },
  )

  app.post<{ Params: { id: string }; Body: { chatId?: string } }>(
    '/api/platform/channels/:id/test',
    async (req, reply) => {
      const pref = (
        manager as unknown as {
          load: () => { channels: Array<{ id: string; kind: ChannelKind; enabled: boolean; creds: Record<string, string> }> }
        }
      ).load()
      const config = pref.channels.find((c) => c.id === req.params.id)
      if (!config) return reply.code(404).send({ error: 'channel not found' })
      const adapter = channelAdapters[config.kind]
      const chatId = String(req.body?.chatId ?? '')
      if (!chatId) {
        return reply.code(400).send({ error: 'chatId required (target chat / reply webhook)' })
      }
      try {
        const handle = await adapter.send(
          config.creds,
          chatId,
          'Opptrix 渠道连通性测试 ✓',
          (url, init) => fetch(url, init as never).then((r) => ({
            ok: r.ok,
            status: r.status,
            headers: Object.fromEntries(r.headers.entries()),
            text: () => r.text(),
            json: () => r.json(),
          })),
        )
        return { ok: true, handle }
      } catch (err) {
        return reply.code(502).send({
          error: err instanceof Error ? err.message : 'test send failed',
        })
      }
    },
  )

  app.get<{ Params: { id: string } }>(
    '/api/platform/channels/:id/setup',
    async (req, reply) => {
      const kind = req.params.id as ChannelKind
      const adapter = channelAdapters[kind]
      if (!adapter) return reply.code(404).send({ error: 'unknown channel kind' })
      return { kind, guide: adapter.setupGuide(), supportsEdit: adapter.supportsEdit }
    },
  )

  // ── Public webhook (adapter-verified; auth hook skips owner session) ─────
  // Raw-body capture: signature verification (Slack HMAC, QQ Ed25519) needs
  // the EXACT request bytes — JSON.stringify(parsed) is not byte-stable.
  app.post<{
    Params: { id: string }
    Querystring: Record<string, string>
  }>(
    '/api/channels/webhook/:id',
    {
      preParsing: async (req, _reply, payload, done) => {
        const chunks: Buffer[] = []
        payload.on('data', (c: Buffer) => chunks.push(c))
        payload.on('end', () => {
          ;(req as unknown as { rawBodyText?: string }).rawBodyText =
            Buffer.concat(chunks).toString('utf8')
          done(null, payload)
        })
      },
    },
    async (req, reply) => {
      const rawBody =
        (req as unknown as { rawBodyText?: string }).rawBodyText ??
        (typeof req.body === 'string' ? req.body : JSON.stringify(req.body ?? {}))
      const result = await manager.handleWebhook(req.params.id, {
        method: req.method,
        headers: req.headers as Record<string, string>,
        rawBody,
        query: (req.query ?? {}) as Record<string, string>,
      })
      if (!result.handled) {
        return reply.code(result.status).send(result.body)
      }
      return result.body
    },
  )
}
