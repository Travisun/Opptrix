/**
 * 外部 MCP Server 配置持久化 — documents 命名空间 `mcp_servers`。
 */

import {
  MCP_SERVERS_NAMESPACE,
  endpointPreviewFromTransport,
  isValidMcpServerId,
  type McpServerCreateInput,
  type McpServerPatch,
  type McpServerRecord,
  type PublicMcpServer,
} from '@opptrix/shared'
import type { UserDataStore } from './store.js'

function nowIso(): string {
  return new Date().toISOString()
}

function slugifyId(title: string): string {
  const base = title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
  return base || `mcp-${Date.now().toString(36)}`
}

export class McpServersRepository {
  constructor(private readonly store: UserDataStore) {}

  listAll(): McpServerRecord[] {
    return this.store
      .listDocuments<McpServerRecord>(MCP_SERVERS_NAMESPACE)
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id))
  }

  get(id: string): McpServerRecord | null {
    return this.store.getDocument<McpServerRecord>(MCP_SERVERS_NAMESPACE, id)
  }

  create(input: McpServerCreateInput): McpServerRecord {
    let id = (input.id ?? slugifyId(input.title)).trim().toLowerCase()
    if (!isValidMcpServerId(id)) {
      throw new Error(`无效的 MCP Server id: ${id}（须小写字母开头，仅 a-z0-9_-）`)
    }
    if (this.get(id)) {
      throw new Error(`MCP Server 已存在: ${id}`)
    }
    const ts = nowIso()
    const maxOrder = this.listAll().reduce((m, r) => Math.max(m, r.sortOrder), -1)
    const row: McpServerRecord = {
      id,
      title: input.title.trim() || id,
      enabled: input.enabled ?? true,
      paused: input.paused ?? false,
      sortOrder: input.sortOrder ?? maxOrder + 1,
      transportConfig: input.transportConfig,
      secrets: { ...(input.secrets ?? {}) },
      capabilityBindings: { ...(input.capabilityBindings ?? {}) },
      installSource: input.installSource ?? 'manual',
      createdAt: ts,
      updatedAt: ts,
    }
    this.store.setDocument(MCP_SERVERS_NAMESPACE, id, row)
    return row
  }

  save(id: string, patch: McpServerPatch): McpServerRecord {
    const prev = this.get(id)
    if (!prev) throw new Error(`未知 MCP Server: ${id}`)
    const secrets = { ...prev.secrets }
    if (patch.secrets) {
      for (const [k, v] of Object.entries(patch.secrets)) {
        if (v === '') delete secrets[k]
        else secrets[k] = v
      }
    }
    const row: McpServerRecord = {
      ...prev,
      title: patch.title?.trim() || prev.title,
      enabled: patch.enabled ?? prev.enabled,
      paused: patch.paused ?? prev.paused,
      sortOrder: patch.sortOrder ?? prev.sortOrder,
      transportConfig: patch.transportConfig ?? prev.transportConfig,
      secrets,
      capabilityBindings: patch.capabilityBindings ?? prev.capabilityBindings,
      updatedAt: nowIso(),
    }
    this.store.setDocument(MCP_SERVERS_NAMESPACE, id, row)
    return row
  }

  delete(id: string): boolean {
    if (!this.get(id)) return false
    this.store.deleteDocument(MCP_SERVERS_NAMESPACE, id)
    return true
  }

  reorder(ids: string[]): McpServerRecord[] {
    const all = this.listAll()
    const byId = new Map(all.map(r => [r.id, r]))
    const ordered = ids.filter(id => byId.has(id))
    for (const r of all) {
      if (!ordered.includes(r.id)) ordered.push(r.id)
    }
    const out: McpServerRecord[] = []
    ordered.forEach((id, index) => {
      const prev = byId.get(id)!
      const row: McpServerRecord = { ...prev, sortOrder: index, updatedAt: nowIso() }
      this.store.setDocument(MCP_SERVERS_NAMESPACE, id, row)
      out.push(row)
    })
    return out
  }

  toPublic(
    row: McpServerRecord,
    extras?: { health?: PublicMcpServer['health']; toolCount?: number },
  ): PublicMcpServer {
    const secretsConfigured: Record<string, boolean> = {}
    for (const [k, v] of Object.entries(row.secrets)) {
      secretsConfigured[k] = Boolean(v?.trim())
    }
    return {
      id: row.id,
      title: row.title,
      enabled: row.enabled,
      paused: row.paused,
      sortOrder: row.sortOrder,
      transport: row.transportConfig.transport,
      endpointPreview: endpointPreviewFromTransport(row.transportConfig),
      secretsConfigured,
      capabilityBindings: row.capabilityBindings,
      installSource: row.installSource,
      health: extras?.health ?? (row.paused ? 'paused' : 'unknown'),
      toolCount: extras?.toolCount ?? 0,
      lastError: row.lastError,
      lastHealthyAt: row.lastHealthyAt,
      updatedAt: row.updatedAt,
    }
  }
}
