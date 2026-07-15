/**
 * 外部 MCP Server CRUD / 测试连接 / 重排 — REST API。
 * 响应永不包含明文 secrets。
 */

import type { FastifyInstance } from 'fastify'
import {
  getExternalMcpRegistry,
  type ExternalMcpRegistry,
} from '@opptrix/agent'
import type {
  McpCapabilityBindings,
  McpServerCreateInput,
  McpServerPatch,
  McpTransportConfig,
} from '@opptrix/shared'
import { isValidMcpServerId } from '@opptrix/shared'

function parseTransportConfig(raw: unknown): McpTransportConfig | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const o = raw as Record<string, unknown>
  const transport = String(o.transport ?? '').trim().toLowerCase()
  if (transport === 'stdio') {
    const command = String(o.command ?? '').trim()
    if (!command) return null
    return {
      transport: 'stdio',
      command,
      args: Array.isArray(o.args) ? o.args.map(String) : undefined,
      cwd: o.cwd != null ? String(o.cwd) : undefined,
      env: o.env && typeof o.env === 'object' && !Array.isArray(o.env)
        ? Object.fromEntries(
          Object.entries(o.env as Record<string, unknown>).map(([k, v]) => [k, String(v)]),
        )
        : undefined,
    }
  }
  if (transport === 'http') {
    const url = String(o.url ?? '').trim()
    if (!url) return null
    return {
      transport: 'http',
      url,
      headers: o.headers && typeof o.headers === 'object' && !Array.isArray(o.headers)
        ? Object.fromEntries(
          Object.entries(o.headers as Record<string, unknown>).map(([k, v]) => [k, String(v)]),
        )
        : undefined,
    }
  }
  return null
}

function parseSecrets(raw: unknown): Record<string, string> | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined
  return Object.fromEntries(
    Object.entries(raw as Record<string, unknown>).map(([k, v]) => [k, String(v ?? '')]),
  )
}

function parseBindings(raw: unknown): McpCapabilityBindings | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined
  return Object.fromEntries(
    Object.entries(raw as Record<string, unknown>).map(([k, v]) => [k, String(v)]),
  )
}

function publicList(reg: ExternalMcpRegistry) {
  return { servers: reg.listPublic() }
}

export async function registerMcpServerRoutes(app: FastifyInstance) {
  app.get('/api/mcp-servers', async () => {
    const reg = getExternalMcpRegistry()
    await reg.hydrate()
    return publicList(reg)
  })

  app.get<{ Params: { id: string } }>('/api/mcp-servers/:id', async (req, reply) => {
    const reg = getExternalMcpRegistry()
    await reg.hydrate()
    const row = reg.listPublic().find(s => s.id === req.params.id)
    if (!row) return reply.status(404).send({ error: 'MCP Server 不存在' })
    return { server: row }
  })

  app.post<{
    Body: {
      id?: string
      title?: string
      enabled?: boolean
      paused?: boolean
      sortOrder?: number
      transportConfig?: unknown
      secrets?: unknown
      capabilityBindings?: unknown
      installSource?: 'manual' | 'registry'
    }
  }>('/api/mcp-servers', async (req, reply) => {
    const title = String(req.body?.title ?? '').trim()
    if (!title) return reply.status(400).send({ error: 'title 必填' })
    const transportConfig = parseTransportConfig(req.body?.transportConfig)
    if (!transportConfig) {
      return reply.status(400).send({ error: 'transportConfig 无效（stdio 需 command，http 需 url）' })
    }
    const id = req.body?.id != null ? String(req.body.id).trim().toLowerCase() : undefined
    if (id && !isValidMcpServerId(id)) {
      return reply.status(400).send({ error: '无效的 id（须小写字母开头，仅 a-z0-9_-）' })
    }
    const input: McpServerCreateInput = {
      id,
      title,
      enabled: req.body?.enabled,
      paused: req.body?.paused,
      sortOrder: req.body?.sortOrder,
      transportConfig,
      secrets: parseSecrets(req.body?.secrets),
      capabilityBindings: parseBindings(req.body?.capabilityBindings),
      installSource: req.body?.installSource === 'registry' ? 'registry' : 'manual',
    }
    try {
      const reg = getExternalMcpRegistry()
      const row = reg.create(input)
      await reg.hydrate()
      const server = reg.listPublic().find(s => s.id === row.id)
      return reply.status(201).send({ server })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      return reply.status(400).send({ error: msg })
    }
  })

  app.patch<{
    Params: { id: string }
    Body: {
      title?: string
      enabled?: boolean
      paused?: boolean
      sortOrder?: number
      transportConfig?: unknown
      secrets?: unknown
      capabilityBindings?: unknown
    }
  }>('/api/mcp-servers/:id', async (req, reply) => {
    const reg = getExternalMcpRegistry()
    if (!reg.getRecord(req.params.id)) {
      return reply.status(404).send({ error: 'MCP Server 不存在' })
    }
    const patch: McpServerPatch = {}
    if (req.body?.title !== undefined) patch.title = String(req.body.title)
    if (req.body?.enabled !== undefined) patch.enabled = Boolean(req.body.enabled)
    if (req.body?.paused !== undefined) patch.paused = Boolean(req.body.paused)
    if (req.body?.sortOrder !== undefined) patch.sortOrder = Number(req.body.sortOrder)
    if (req.body?.transportConfig !== undefined) {
      const cfg = parseTransportConfig(req.body.transportConfig)
      if (!cfg) return reply.status(400).send({ error: 'transportConfig 无效' })
      patch.transportConfig = cfg
    }
    if (req.body?.secrets !== undefined) {
      const secrets = parseSecrets(req.body.secrets)
      if (secrets) patch.secrets = secrets
    }
    if (req.body?.capabilityBindings !== undefined) {
      const bindings = parseBindings(req.body.capabilityBindings)
      if (bindings) patch.capabilityBindings = bindings
    }
    try {
      reg.save(req.params.id, patch)
      await reg.hydrate()
      const server = reg.listPublic().find(s => s.id === req.params.id)
      return { server }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      return reply.status(400).send({ error: msg })
    }
  })

  app.delete<{ Params: { id: string } }>('/api/mcp-servers/:id', async (req, reply) => {
    const reg = getExternalMcpRegistry()
    if (!reg.delete(req.params.id)) {
      return reply.status(404).send({ error: 'MCP Server 不存在' })
    }
    return { ok: true, deleted: req.params.id }
  })

  app.post<{ Params: { id: string } }>('/api/mcp-servers/:id/test', async (req, reply) => {
    const reg = getExternalMcpRegistry()
    if (!reg.getRecord(req.params.id)) {
      return reply.status(404).send({ error: 'MCP Server 不存在' })
    }
    const result = await reg.testConnection(req.params.id)
    return { ...result, server: reg.listPublic().find(s => s.id === req.params.id) }
  })

  app.post<{ Body: { server_ids?: string[]; serverIds?: string[] } }>(
    '/api/mcp-servers/reorder',
    async (req, reply) => {
      const raw = req.body?.server_ids ?? req.body?.serverIds
      const ids = Array.isArray(raw) ? raw.map(String) : []
      if (!ids.length) return reply.status(400).send({ error: 'server_ids 必填' })
      const reg = getExternalMcpRegistry()
      reg.reorder(ids)
      await reg.hydrate()
      return publicList(reg)
    },
  )
}
