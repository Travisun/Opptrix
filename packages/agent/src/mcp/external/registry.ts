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

  async testConnection(id: string): Promise<{ ok: boolean; message: string; tools?: string[] }> {
    const row = this.repo.get(id)
    if (!row) return { ok: false, message: `未知服务器: ${id}` }
    const { client, transport } = createSdkConnection(row)
    try {
      await client.connect(transport)
      const { tools } = await client.listTools()
      this.health.recordSuccess(id)
      await client.close().catch(() => {})
      const names = tools.map(t => t.name)
      return { ok: true, message: `连接成功，发现 ${names.length} 个工具`, tools: names }
    } catch (e) {
      this.health.recordFailure(id, e)
      const msg = e instanceof Error ? e.message : String(e)
      await client.close().catch(() => {})
      return { ok: false, message: msg }
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
