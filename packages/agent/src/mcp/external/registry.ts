/**
 * 外部 MCP Server 注册表：连接池、工具 catalog、绑定解析。
 */

import {
  isMcpServerFailoverError,
  parseNamespacedMcpTool,
  type McpServerCreateInput,
  type McpServerPatch,
  type McpServerRecord,
  type PublicMcpServer,
} from '@opptrix/shared'
import { getUserDataStore } from '@opptrix/user-store'
import type { JsonSchema, OpenAiTool } from '../../tools.js'
import {
  createSdkConnection,
  parseToolResult,
  toOpenAiTool,
  type SdkConnection,
} from './connection.js'
import { ExternalMcpHealth } from './health.js'

export interface BindingCandidate {
  serverId: string
  remoteTool: string
}

export class ExternalMcpRegistry {
  private connections = new Map<string, SdkConnection>()
  private toolCounts = new Map<string, number>()
  readonly health = new ExternalMcpHealth()
  private hydratePromise: Promise<void> | null = null

  private get repo() {
    return getUserDataStore().mcpServers
  }

  listRecords(): McpServerRecord[] {
    return this.repo.listAll()
  }

  getRecord(id: string): McpServerRecord | null {
    return this.repo.get(id)
  }

  async hydrate(): Promise<void> {
    if (this.hydratePromise) return this.hydratePromise
    this.hydratePromise = this.doHydrate()
    try {
      await this.hydratePromise
    } finally {
      this.hydratePromise = null
    }
  }

  private async doHydrate(): Promise<void> {
    const rows = this.repo.listAll().filter(r => r.enabled && !r.paused)
    const want = new Set(rows.map(r => r.id))
    for (const id of [...this.connections.keys()]) {
      if (!want.has(id)) {
        await this.connections.get(id)?.client.close().catch(() => {})
        this.connections.delete(id)
        this.toolCounts.delete(id)
      }
    }
    await Promise.all(rows.map(row => this.ensureConnected(row)))
  }

  private async ensureConnected(row: McpServerRecord): Promise<SdkConnection | null> {
    let entry = this.connections.get(row.id)
    if (entry) {
      const prev = this.repo.get(row.id)
      const same = prev
        && JSON.stringify(prev.transportConfig) === JSON.stringify(row.transportConfig)
        && JSON.stringify(prev.secrets) === JSON.stringify(row.secrets)
      if (same) return entry
      await entry.client.close().catch(() => {})
      this.connections.delete(row.id)
      this.toolCounts.delete(row.id)
    }
    const conn = createSdkConnection(row)
    try {
      await conn.client.connect(conn.transport)
      this.connections.set(row.id, conn)
      this.health.recordSuccess(row.id)
      const { tools } = await conn.client.listTools()
      this.toolCounts.set(row.id, tools.length)
      const cur = this.repo.get(row.id)
      if (cur) {
        getUserDataStore().setDocument('mcp_servers', row.id, {
          ...cur,
          lastError: undefined,
          lastHealthyAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        })
      }
      return conn
    } catch (e) {
      this.health.recordFailure(row.id, e)
      const msg = e instanceof Error ? e.message : String(e)
      const cur = this.repo.get(row.id)
      if (cur) {
        getUserDataStore().setDocument('mcp_servers', row.id, {
          ...cur,
          lastError: msg.slice(0, 200),
          updatedAt: new Date().toISOString(),
        })
      }
      await conn.client.close().catch(() => {})
      return null
    }
  }

  listPublic(): PublicMcpServer[] {
    return this.repo.listAll().map(row => this.repo.toPublic(row, {
      health: this.health.getState(row.id, row.paused),
      toolCount: this.toolCounts.get(row.id) ?? 0,
    }))
  }

  create(input: McpServerCreateInput): McpServerRecord {
    return this.repo.create(input)
  }

  save(id: string, patch: McpServerPatch): McpServerRecord {
    const row = this.repo.save(id, patch)
    if (!row.enabled || row.paused) {
      void this.connections.get(id)?.client.close().then(() => {
        this.connections.delete(id)
        this.toolCounts.delete(id)
      })
      this.health.reset(id)
    }
    return row
  }

  delete(id: string): boolean {
    void this.connections.get(id)?.client.close()
    this.connections.delete(id)
    this.toolCounts.delete(id)
    this.health.reset(id)
    return this.repo.delete(id)
  }

  reorder(ids: string[]): McpServerRecord[] {
    return this.repo.reorder(ids)
  }

  /** 已启用且健康的服务器上的 namespaced 独有工具（未出现在 bindings 值中的） */
  async listNamespacedOpenAiTools(): Promise<OpenAiTool[]> {
    const out: OpenAiTool[] = []
    const rows = this.repo.listAll()
      .filter(r => r.enabled && !r.paused)
      .sort((a, b) => a.sortOrder - b.sortOrder)

    for (const row of rows) {
      if (this.health.shouldSkip(row.id, row.paused)) continue
      const conn = this.connections.get(row.id)
      if (!conn) continue
      const boundRemotes = new Set(Object.values(row.capabilityBindings))
      const { tools } = await conn.client.listTools()
      for (const t of tools) {
        if (boundRemotes.has(t.name)) continue
        out.push(toOpenAiTool(
          row.id,
          t.name,
          t.description ?? '',
          (t.inputSchema ?? { type: 'object', properties: {} }) as JsonSchema,
          true,
        ))
      }
    }
    return out
  }

  /** 本地工具名 → 按优先级的外部候选链 */
  resolveBindingChain(localToolName: string): BindingCandidate[] {
    const rows = this.repo.listAll()
      .filter(r => r.enabled && !r.paused)
      .sort((a, b) => a.sortOrder - b.sortOrder)
    const out: BindingCandidate[] = []
    for (const row of rows) {
      if (this.health.shouldSkip(row.id, row.paused)) continue
      const remote = row.capabilityBindings[localToolName]
      if (!remote) continue
      if (!this.connections.has(row.id)) continue
      out.push({ serverId: row.id, remoteTool: remote })
    }
    return out
  }

  async callExternal(
    serverId: string,
    toolName: string,
    args: Record<string, unknown>,
    opts?: { signal?: AbortSignal; timeoutMs?: number },
  ): Promise<unknown> {
    const row = this.repo.get(serverId)
    if (!row) throw new Error(`未知 MCP Server: ${serverId}`)
    if (!row.enabled || row.paused) throw new Error(`MCP Server ${serverId} 未启用或已暂停`)
    if (this.health.shouldSkip(serverId, row.paused)) {
      throw new Error(`MCP Server ${serverId} 熔断冷却中: ${this.health.lastError(serverId)}`)
    }
    let entry = this.connections.get(serverId) ?? null
    if (!entry) {
      entry = await this.ensureConnected(row)
      if (!entry) throw new Error(`无法连接 MCP Server ${serverId}`)
    }
    const timeout = opts?.timeoutMs ?? 120_000
    const result = await entry.client.callTool(
      { name: toolName, arguments: args },
      undefined,
      { timeout, maxTotalTimeout: timeout * 2, signal: opts?.signal },
    )
    this.health.recordSuccess(serverId)
    return parseToolResult(serverId, toolName, result)
  }

  async callNamespaced(
    name: string,
    args: Record<string, unknown>,
    opts?: { signal?: AbortSignal; timeoutMs?: number },
  ): Promise<unknown> {
    const parsed = parseNamespacedMcpTool(name)
    if (!parsed) throw new Error(`非命名空间 MCP 工具: ${name}`)
    return this.callExternal(parsed.serverId, parsed.toolName, args, opts)
  }

  async testConnection(id: string): Promise<{
    ok: boolean
    message: string
    tools?: string[]
    toolsCount?: number
    serverVersion?: { name: string; version: string } | null
    capabilities?: { [key: string]: unknown } | null
  }> {
    const row = this.repo.get(id)
    if (!row) return { ok: false, message: `未知服务器: ${id}` }
    const { client, transport } = createSdkConnection(row)
    try {
      await client.connect(transport)
      const caps = client.getServerCapabilities()
      const [version, tools] = await Promise.all([
        Promise.resolve(client.getServerVersion() ?? null),
        client.listTools(),
      ])
      this.health.recordSuccess(id)
      await client.close().catch(() => {})
      const names = tools.tools.map(t => t.name)
      return {
        ok: true,
        message: `连接成功，发现 ${names.length} 个工具`,
        tools: names,
        toolsCount: names.length,
        serverVersion: version ? { name: version.name, version: version.version } : null,
        capabilities: caps ? { ...caps } : null,
      }
    } catch (e) {
      this.health.recordFailure(id, e)
      const msg = e instanceof Error ? e.message : String(e)
      await client.close().catch(() => {})
      return { ok: false, message: msg }
    }
  }

  async getServerInfo(id: string): Promise<{
    version: { name: string; version: string } | null
    capabilities: { [key: string]: unknown } | null
    instructions: string | null
  }> {
    const row = this.repo.get(id)
    if (!row) return { version: null, capabilities: null, instructions: null }
    let entry = this.connections.get(id) ?? null
    if (!entry) {
      entry = await this.ensureConnected(row)
      if (!entry) return { version: null, capabilities: null, instructions: null }
    }
    const client = entry.client
    const caps = client.getServerCapabilities()
    return {
      version: client.getServerVersion() ?? null,
      capabilities: caps ? { ...caps } : null,
      instructions: client.getInstructions() ?? null,
    }
  }

  async ping(id: string): Promise<{ ok: boolean; message: string }> {
    const row = this.repo.get(id)
    if (!row) return { ok: false, message: `未知服务器: ${id}` }
    const { client, transport } = createSdkConnection(row)
    const start = Date.now()
    try {
      await client.connect(transport)
      await client.ping()
      const ms = Date.now() - start
      this.health.recordSuccess(id)
      await client.close().catch(() => {})
      return { ok: true, message: `pong (${ms}ms)` }
    } catch (e) {
      this.health.recordFailure(id, e)
      const msg = e instanceof Error ? e.message : String(e)
      await client.close().catch(() => {})
      return { ok: false, message: msg }
    }
  }

  async listPrompts(id: string): Promise<{ prompts: Array<{ name: string; description?: string; arguments?: unknown[] }> }> {
    const row = this.repo.get(id)
    if (!row || !row.enabled || row.paused) return { prompts: [] }
    let entry = this.connections.get(id) ?? null
    if (!entry) {
      entry = await this.ensureConnected(row)
      if (!entry) return { prompts: [] }
    }
    try {
      const { prompts } = await entry.client.listPrompts()
      return { prompts: prompts.map(p => ({ name: p.name, description: p.description })) }
    } catch {
      return { prompts: [] }
    }
  }

  async getPrompt(id: string, name: string, args?: Record<string, string>): Promise<{ messages?: unknown[] }> {
    const row = this.repo.get(id)
    if (!row || !row.enabled || row.paused) return {}
    let entry = this.connections.get(id) ?? null
    if (!entry) {
      entry = await this.ensureConnected(row)
      if (!entry) return {}
    }
    try {
      const params: { name: string; arguments?: Record<string, string> } = { name }
      if (args) params.arguments = args
      const result = await entry.client.getPrompt(params)
      return { messages: result.messages }
    } catch {
      return {}
    }
  }

  async listResources(id: string): Promise<{ resources: Array<{ uri: string; name: string; description?: string; mimeType?: string }> }> {
    const row = this.repo.get(id)
    if (!row || !row.enabled || row.paused) return { resources: [] }
    let entry = this.connections.get(id) ?? null
    if (!entry) {
      entry = await this.ensureConnected(row)
      if (!entry) return { resources: [] }
    }
    try {
      const { resources } = await entry.client.listResources()
      return { resources: resources.map(r => ({ uri: r.uri, name: r.name, description: r.description, mimeType: r.mimeType })) }
    } catch {
      return { resources: [] }
    }
  }

  async readResource(id: string, uri: string): Promise<{ contents?: unknown[] }> {
    const row = this.repo.get(id)
    if (!row || !row.enabled || row.paused) return {}
    let entry = this.connections.get(id) ?? null
    if (!entry) {
      entry = await this.ensureConnected(row)
      if (!entry) return {}
    }
    try {
      const result = await entry.client.readResource({ uri })
      return { contents: result.contents }
    } catch {
      return {}
    }
  }

  async listResourceTemplates(id: string): Promise<{ templates: Array<{ uriTemplate: string; name: string; description?: string }> }> {
    const row = this.repo.get(id)
    if (!row || !row.enabled || row.paused) return { templates: [] }
    let entry = this.connections.get(id) ?? null
    if (!entry) {
      entry = await this.ensureConnected(row)
      if (!entry) return { templates: [] }
    }
    try {
      const { resourceTemplates } = await entry.client.listResourceTemplates()
      return { templates: resourceTemplates.map(t => ({ uriTemplate: t.uriTemplate, name: t.name, description: t.description })) }
    } catch {
      return { templates: [] }
    }
  }

  async complete(id: string, ref: unknown, argument: { name: string; value: string }): Promise<{ completion?: { values: string[] } }> {
    const row = this.repo.get(id)
    if (!row || !row.enabled || row.paused) return {}
    let entry = this.connections.get(id) ?? null
    if (!entry) {
      entry = await this.ensureConnected(row)
      if (!entry) return {}
    }
    try {
      const result = await entry.client.complete({ ref, argument } as never)
      return { completion: result.completion }
    } catch {
      return {}
    }
  }

  async setLoggingLevel(id: string, level: string): Promise<{ ok: boolean; message?: string }> {
    const row = this.repo.get(id)
    if (!row || !row.enabled || row.paused) return { ok: false, message: '未启用或已暂停' }
    let entry = this.connections.get(id) ?? null
    if (!entry) {
      entry = await this.ensureConnected(row)
      if (!entry) return { ok: false, message: '无法连接' }
    }
    try {
      await entry.client.setLoggingLevel(level as never)
      return { ok: true, message: `日志级别已设为 ${level}` }
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : String(e) }
    }
  }

  async subscribeResource(id: string, uri: string): Promise<{ ok: boolean; message?: string }> {
    const row = this.repo.get(id)
    if (!row || !row.enabled || row.paused) return { ok: false, message: '未启用或已暂停' }
    let entry = this.connections.get(id) ?? null
    if (!entry) {
      entry = await this.ensureConnected(row)
      if (!entry) return { ok: false, message: '无法连接' }
    }
    try {
      await entry.client.subscribeResource({ uri })
      return { ok: true }
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : String(e) }
    }
  }

  async unsubscribeResource(id: string, uri: string): Promise<{ ok: boolean; message?: string }> {
    const row = this.repo.get(id)
    if (!row || !row.enabled || row.paused) return { ok: false, message: '未启用或已暂停' }
    let entry = this.connections.get(id) ?? null
    if (!entry) {
      entry = await this.ensureConnected(row)
      if (!entry) return { ok: false, message: '无法连接' }
    }
    try {
      await entry.client.unsubscribeResource({ uri })
      return { ok: true }
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : String(e) }
    }
  }

  async closeAll(): Promise<void> {
    await Promise.all(
      [...this.connections.values()].map(c => c.client.close().catch(() => {})),
    )
    this.connections.clear()
    this.toolCounts.clear()
  }
}

let sharedRegistry: ExternalMcpRegistry | null = null

export function getExternalMcpRegistry(): ExternalMcpRegistry {
  if (!sharedRegistry) sharedRegistry = new ExternalMcpRegistry()
  return sharedRegistry
}

export function resetExternalMcpRegistry(): void {
  void sharedRegistry?.closeAll()
  sharedRegistry = null
}

export function annotateMcpResult(
  data: unknown,
  source: string,
  opts?: { degraded?: boolean },
): unknown {
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    return {
      ...(data as Record<string, unknown>),
      _mcp: {
        source,
        degraded: Boolean(opts?.degraded),
      },
    }
  }
  return {
    data,
    _mcp: { source, degraded: Boolean(opts?.degraded) },
  }
}

export { isMcpServerFailoverError }
