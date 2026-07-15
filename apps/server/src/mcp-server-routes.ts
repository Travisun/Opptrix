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
  McpServerRecord,
  McpTransportConfig,
} from '@opptrix/shared'
import {
  isValidMcpServerId,
  maskSecretPreview,
  MCP_BUILTIN_PRESETS,
} from '@opptrix/shared'

interface McpServerFlatConfig {
  type?: string
  command?: string
  args?: string[]
  env?: Record<string, string>
  url?: string
  headers?: Record<string, string>
}

/** 后端记录 → 扁平 mcpServers 格式（secrets 内联到 headers/env） */
function recordToFlat(rec: McpServerRecord): McpServerFlatConfig {
  const transport = rec.transportConfig.transport
  const flat: McpServerFlatConfig = {
    type: transport === 'streamable-http' ? 'http' : transport,
  }
  if (transport === 'stdio') {
    flat.command = rec.transportConfig.command
    if (rec.transportConfig.args?.length) flat.args = [...rec.transportConfig.args]
    const env: Record<string, string> = { ...(rec.transportConfig.env ?? {}) }
    for (const [k, v] of Object.entries(rec.secrets)) env[k] = v
    if (Object.keys(env).length) flat.env = env
    return flat
  }
  const http = rec.transportConfig as { url: string; headers?: Record<string, string> }
  flat.url = http.url
  const headers: Record<string, string> = { ...(http.headers ?? {}) }
  for (const [k, v] of Object.entries(rec.secrets)) headers[k] = v
  if (Object.keys(headers).length) flat.headers = headers
  return flat
}

const SECRET_HEADER_RE = /^(authorization|x-api-key|api-key|x-auth-token|token)$/i

/** 扁平 mcpServers 格式 → McpServerCreateInput；返回 null 表示结构无效 */
function flatToCreateInput(id: string, flat: McpServerFlatConfig): McpServerCreateInput | null {
  const type = flat.type && ['stdio', 'http', 'sse'].includes(flat.type)
    ? flat.type
    : (flat.command ? 'stdio' : 'http')
  let transport: McpTransportConfig
  const secrets: Record<string, string> = {}
  if (type === 'stdio') {
    if (!flat.command) return null
    transport = {
      transport: 'stdio',
      command: flat.command,
      args: flat.args?.length ? [...flat.args] : undefined,
      env: flat.env && Object.keys(flat.env).length ? { ...flat.env } : undefined,
    }
  } else {
    if (!flat.url) return null
    const transportType = type === 'sse' ? 'sse' : 'streamable-http'
    if (flat.headers) {
      const headers: Record<string, string> = {}
      for (const [k, v] of Object.entries(flat.headers)) {
        if (SECRET_HEADER_RE.test(k)) secrets[k] = v
        else headers[k] = v
      }
      transport = {
        transport: transportType,
        url: flat.url,
        headers: Object.keys(headers).length ? headers : undefined,
      }
    } else {
      transport = { transport: transportType, url: flat.url }
    }
  }
  return {
    id,
    title: id,
    transportConfig: transport,
    enabled: true,
    secrets: Object.keys(secrets).length ? secrets : undefined,
  }
}

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
  if (transport === 'http' || transport === 'streamable-http') {
    const url = String(o.url ?? '').trim()
    if (!url) return null
    return {
      transport: 'streamable-http',
      url,
      headers: o.headers && typeof o.headers === 'object' && !Array.isArray(o.headers)
        ? Object.fromEntries(
          Object.entries(o.headers as Record<string, unknown>).map(([k, v]) => [k, String(v)]),
        )
        : undefined,
    }
  }
  if (transport === 'sse') {
    const url = String(o.url ?? '').trim()
    if (!url) return null
    return {
      transport: 'sse',
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

  app.get<{ Params: { id: string } }>('/api/mcp-servers/:id/info', async (req, reply) => {
    const reg = getExternalMcpRegistry()
    if (!reg.getRecord(req.params.id)) {
      return reply.status(404).send({ error: 'MCP Server 不存在' })
    }
    return await reg.getServerInfo(req.params.id)
  })

  app.post<{ Params: { id: string } }>('/api/mcp-servers/:id/ping', async (req, reply) => {
    const reg = getExternalMcpRegistry()
    if (!reg.getRecord(req.params.id)) {
      return reply.status(404).send({ error: 'MCP Server 不存在' })
    }
    return await reg.ping(req.params.id)
  })

  app.get<{ Params: { id: string } }>('/api/mcp-servers/:id/prompts', async (req, reply) => {
    const reg = getExternalMcpRegistry()
    return await reg.listPrompts(req.params.id)
  })

  app.post<{
    Params: { id: string; name: string }
    Body?: { arguments?: Record<string, string> }
  }>('/api/mcp-servers/:id/prompts/:name', async (req, reply) => {
    const reg = getExternalMcpRegistry()
    return await reg.getPrompt(req.params.id, req.params.name, req.body?.arguments)
  })

  app.get<{ Params: { id: string } }>('/api/mcp-servers/:id/resources', async (req, reply) => {
    const reg = getExternalMcpRegistry()
    return await reg.listResources(req.params.id)
  })

  app.post<{
    Params: { id: string }
    Body: { uri: string }
  }>('/api/mcp-servers/:id/resources/read', async (req, reply) => {
    const reg = getExternalMcpRegistry()
    const uri = req.body?.uri
    if (!uri || typeof uri !== 'string') {
      return reply.status(400).send({ error: 'uri 必填' })
    }
    return await reg.readResource(req.params.id, uri)
  })

  app.get<{ Params: { id: string } }>('/api/mcp-servers/:id/resource-templates', async (req, reply) => {
    const reg = getExternalMcpRegistry()
    return await reg.listResourceTemplates(req.params.id)
  })

  app.post<{
    Params: { id: string }
    Body: { ref: unknown; argument: { name: string; value: string } }
  }>('/api/mcp-servers/:id/complete', async (req, reply) => {
    const reg = getExternalMcpRegistry()
    const { ref, argument } = req.body ?? {}
    if (!argument?.name || !argument?.value) {
      return reply.status(400).send({ error: 'argument.name 与 argument.value 必填' })
    }
    return await reg.complete(req.params.id, ref, argument)
  })

  app.post<{
    Params: { id: string }
    Body: { level: string }
  }>('/api/mcp-servers/:id/logging-level', async (req, reply) => {
    const reg = getExternalMcpRegistry()
    const level = req.body?.level
    if (!level || typeof level !== 'string') {
      return reply.status(400).send({ error: 'level 必填' })
    }
    return await reg.setLoggingLevel(req.params.id, level)
  })

  app.post<{
    Params: { id: string }
    Body: { uri: string }
  }>('/api/mcp-servers/:id/subscribe', async (req, reply) => {
    const reg = getExternalMcpRegistry()
    const uri = req.body?.uri
    if (!uri || typeof uri !== 'string') {
      return reply.status(400).send({ error: 'uri 必填' })
    }
    return await reg.subscribeResource(req.params.id, uri)
  })

  app.post<{
    Params: { id: string }
    Body: { uri: string }
  }>('/api/mcp-servers/:id/unsubscribe', async (req, reply) => {
    const reg = getExternalMcpRegistry()
    const uri = req.body?.uri
    if (!uri || typeof uri !== 'string') {
      return reply.status(400).send({ error: 'uri 必填' })
    }
    return await reg.unsubscribeResource(req.params.id, uri)
  })

  /**
   * 导出完整 mcpServers 扁平格式（标准客户端配置结构 + secrets 内联）。
   * 格式：{ mcpServers: { [id]: { type, command?, args?, env?, url?, headers? } } }
   */
  app.get('/api/mcp-servers/export', async (_req, reply) => {
    const reg = getExternalMcpRegistry()
    await reg.hydrate()
    const mcpServers: Record<string, McpServerFlatConfig> = {}
    for (const rec of reg.listRecords()) {
      mcpServers[rec.id] = recordToFlat(rec)
    }
    return reply.send({ mcpServers })
  })

  /**
   * 全量同步 — 删除现有全部记录，按提交 JSON 重建。
   * Body: { mcpServers: { [id]: McpServerFlatConfig } }
   */
  app.put<{ Body: { mcpServers?: Record<string, McpServerFlatConfig> } }>(
    '/api/mcp-servers/import',
    async (req, reply) => {
      const mcpServers = req.body?.mcpServers
      if (!mcpServers || typeof mcpServers !== 'object' || Array.isArray(mcpServers)) {
        return reply.status(400).send({ error: 'mcpServers 必填且须为对象' })
      }
      const entries = Object.entries(mcpServers)
      for (const [id, cfg] of entries) {
        if (typeof cfg !== 'object' || cfg === null || Array.isArray(cfg)) {
          return reply.status(400).send({ error: `${id} 的配置须为对象` })
        }
      }
      const reg = getExternalMcpRegistry()
      await reg.hydrate()
      for (const rec of reg.listRecords()) reg.delete(rec.id)
      for (const [id, cfg] of entries) {
        const input = flatToCreateInput(id, cfg)
        if (!input) {
          return reply.status(400).send({ error: `${id} 配置无效（缺少 command 或 url）` })
        }
        reg.create(input)
      }
      await reg.hydrate()
      return publicList(reg)
    },
  )

  // ── 内置 MCP 预设 ──

  app.get('/api/mcp-servers/presets', async (_req, reply) => {
    const reg = getExternalMcpRegistry()
    await reg.hydrate()
    const records = reg.listRecords()
    const recordsById = new Map(records.map(r => [r.id, r]))
    const presets = MCP_BUILTIN_PRESETS.map(p => ({
      ...p,
      services: p.services.map(s => {
        const rec = recordsById.get(s.serverId)
        const apiKey = rec?.secrets?.[s.apiKeyHeader]
        return {
          serverId: s.serverId,
          title: s.title,
          url: s.url,
          apiKeyHeader: s.apiKeyHeader,
          configured: rec != null && rec.enabled,
          apiKeyPreview: apiKey ?? undefined,
        }
      }),
    }))
    return reply.send({ presets })
  })

  app.post<{
    Body: { presetId?: string; apiKey?: string }
  }>('/api/mcp-servers/apply-preset', async (req, reply) => {
    const presetId = String(req.body?.presetId ?? '').trim()
    const apiKey = String(req.body?.apiKey ?? '').trim()
    if (!presetId) return reply.status(400).send({ error: 'presetId 必填' })
    if (!apiKey) return reply.status(400).send({ error: 'apiKey 必填' })
    const preset = MCP_BUILTIN_PRESETS.find(p => p.id === presetId)
    if (!preset) return reply.status(400).send({ error: `未知预设: ${presetId}` })
    const reg = getExternalMcpRegistry()
    await reg.hydrate()
    for (const svc of preset.services) {
      const existing = reg.getRecord(svc.serverId)
      const tc: McpTransportConfig = { transport: 'streamable-http', url: svc.url }
      const sc: Record<string, string> = { [svc.apiKeyHeader]: apiKey }
      if (existing) {
        reg.save(svc.serverId, { transportConfig: tc, secrets: sc, enabled: true, paused: false })
      } else {
        reg.create({
          id: svc.serverId,
          title: svc.title,
          enabled: true,
          transportConfig: tc,
          secrets: sc,
          installSource: 'registry',
        })
      }
    }
    await reg.hydrate()
    return reply.send({ ok: true })
  })

  app.post<{
    Body: { presetId?: string }
  }>('/api/mcp-servers/remove-preset', async (req, reply) => {
    const presetId = String(req.body?.presetId ?? '').trim()
    if (!presetId) return reply.status(400).send({ error: 'presetId 必填' })
    const preset = MCP_BUILTIN_PRESETS.find(p => p.id === presetId)
    if (!preset) return reply.status(400).send({ error: `未知预设: ${presetId}` })
    const reg = getExternalMcpRegistry()
    for (const svc of preset.services) {
      const existing = reg.getRecord(svc.serverId)
      if (existing) {
        reg.save(svc.serverId, { enabled: false, paused: true })
      }
    }
    return reply.send({ ok: true })
  })
}
