/**
 * 用户可配置的外部 MCP Server — 配置契约（无 I/O）。
 *
 * 路由约定：已启用且未 pause 的外部源按 sortOrder 优先；
 * 不可用 / 额度过 / 熔断后换下一源；最后回落进程内本地 ToolRegistry。
 */

export type McpServerTransport = 'stdio' | 'http'

export type McpServerInstallSource = 'manual' | 'registry'

export type McpServerHealthState = 'unknown' | 'healthy' | 'degraded' | 'open' | 'paused'

/** 本地稳定工具名 → 外部 Server 上的真实 tool 名 */
export type McpCapabilityBindings = Record<string, string>

export interface McpStdioTransportConfig {
  transport: 'stdio'
  command: string
  args?: string[]
  cwd?: string
  /** 非密钥环境变量 */
  env?: Record<string, string>
}

export interface McpHttpTransportConfig {
  transport: 'http'
  url: string
  /** 非密钥 Header（如 Accept） */
  headers?: Record<string, string>
}

export type McpTransportConfig = McpStdioTransportConfig | McpHttpTransportConfig

/**
 * 持久化行（含密钥明文，仅存用户库；API 对外须掩码）。
 */
export interface McpServerRecord {
  id: string
  title: string
  enabled: boolean
  /** pause=true 时保留配置但不参与路由 / catalog */
  paused: boolean
  /** 越小越优先（外部源之间） */
  sortOrder: number
  transportConfig: McpTransportConfig
  /** secret 环境变量（stdio）或 Authorization Bearer（http）等 */
  secrets: Record<string, string>
  capabilityBindings: McpCapabilityBindings
  installSource: McpServerInstallSource
  createdAt: string
  updatedAt: string
  lastError?: string
  lastHealthyAt?: string
}

export interface McpServerPatch {
  title?: string
  enabled?: boolean
  paused?: boolean
  sortOrder?: number
  transportConfig?: McpTransportConfig
  /** 合并写入；传空字符串可清除某 key */
  secrets?: Record<string, string>
  capabilityBindings?: McpCapabilityBindings
}

/** API / Agent 列表用公开视图（无明文密钥） */
export interface PublicMcpServer {
  id: string
  title: string
  enabled: boolean
  paused: boolean
  sortOrder: number
  transport: McpServerTransport
  /** stdio command 或 http url（脱敏后） */
  endpointPreview: string
  secretsConfigured: Record<string, boolean>
  capabilityBindings: McpCapabilityBindings
  installSource: McpServerInstallSource
  health: McpServerHealthState
  toolCount: number
  lastError?: string
  lastHealthyAt?: string
  updatedAt: string
}

export interface McpServerCreateInput {
  id?: string
  title: string
  enabled?: boolean
  paused?: boolean
  sortOrder?: number
  transportConfig: McpTransportConfig
  secrets?: Record<string, string>
  capabilityBindings?: McpCapabilityBindings
  installSource?: McpServerInstallSource
}

export const MCP_SERVERS_NAMESPACE = 'mcp_servers'

export const MCP_TOOL_NAMESPACE_SEP = '__'

export function namespacedMcpTool(serverId: string, toolName: string): string {
  return `${serverId}${MCP_TOOL_NAMESPACE_SEP}${toolName}`
}

export function parseNamespacedMcpTool(
  name: string,
): { serverId: string; toolName: string } | null {
  const i = name.indexOf(MCP_TOOL_NAMESPACE_SEP)
  if (i <= 0) return null
  const serverId = name.slice(0, i)
  const toolName = name.slice(i + MCP_TOOL_NAMESPACE_SEP.length)
  if (!serverId || !toolName) return null
  return { serverId, toolName }
}

export function isValidMcpServerId(id: string): boolean {
  return /^[a-z][a-z0-9_-]{1,63}$/.test(id)
}

export function maskSecretPreview(value: string): string {
  const v = value.trim()
  if (v.length <= 8) return v ? '••••' : ''
  return `${v.slice(0, 4)}…${v.slice(-4)}`
}

export function endpointPreviewFromTransport(cfg: McpTransportConfig): string {
  if (cfg.transport === 'stdio') {
    const args = (cfg.args ?? []).join(' ')
    return args ? `${cfg.command} ${args}` : cfg.command
  }
  try {
    const u = new URL(cfg.url)
    return `${u.protocol}//${u.host}${u.pathname}`
  } catch {
    return cfg.url.slice(0, 80)
  }
}

/** 判定外部调用失败是否应 failover / 熔断（业务参数错误不在此列） */
export function isMcpServerFailoverError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error ?? '')
  if (!msg.trim()) return false
  if (/quota|rate\s*limit|too\s*many|429|credit|额度过|额度用尽|限流|请求过于频繁/i.test(msg)) {
    return true
  }
  if (/\b(401|403|502|503|504)\b/.test(msg) || /ECONN|ETIMEDOUT|ENOTFOUND|fetch failed|timeout|超时|unavailable|不可用/i.test(msg)) {
    return true
  }
  if (typeof error === 'object' && error !== null && 'status' in error) {
    const status = Number((error as { status: unknown }).status)
    if (status === 401 || status === 403 || status === 429 || status >= 500) return true
  }
  return false
}
