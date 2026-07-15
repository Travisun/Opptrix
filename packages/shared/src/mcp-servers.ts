/**
 * 用户可配置的外部 MCP Server — 配置契约（无 I/O）。
 *
 * 路由约定：已启用且未 pause 的外部源按 sortOrder 优先；
 * 不可用 / 额度过 / 熔断后换下一源；最后回落进程内本地 ToolRegistry。
 *
 * 支持的传输类型：
 * - stdio：本地子进程 stdio 通信
 * - http：Streamable HTTP（单 URL，POST 传输）
 * - streamable-http：同 http，显式名称
 * - sse：旧版 SSE 传输（GET 建流 + POST 发送）
 */

export type McpServerTransport = 'stdio' | 'http' | 'streamable-http' | 'sse'

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
  transport: 'http' | 'streamable-http'
  url: string
  /** 非密钥 Header（如 Accept） */
  headers?: Record<string, string>
}

export interface McpSseTransportConfig {
  transport: 'sse'
  url: string
  /** 非密钥 Header（如 Accept） */
  headers?: Record<string, string>
}

export type McpTransportConfig = McpStdioTransportConfig | McpHttpTransportConfig | McpSseTransportConfig

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

/** 传输类型互转：旧版 'http' 视为 streamable-http；'sse' 保持 */
export function normalizeTransport(transport: string): McpServerTransport {
  if (transport === 'stdio') return 'stdio'
  if (transport === 'sse') return 'sse'
  if (transport === 'streamable-http') return 'streamable-http'
  // 'http' 或未知值默认走 streamable-http（向后兼容）
  return 'streamable-http'
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

// ────────────────────────────────────────────
// 内置 MCP 预设 — 开箱即用，只需 API Key
// ────────────────────────────────────────────

/** 预设中单个底层 MCP 服务的定义 */
export interface McpPresetServiceDef {
  /** 创建后 MCP Server 的 id */
  serverId: string
  /** UI 显示名称 */
  title: string
  /** Streamable HTTP URL */
  url: string
  /** 该服务需要放在哪个 header 传递 API Key */
  apiKeyHeader: string
}

/** 一个预设的定义（UI 展示为一个卡片，可能对应多个底层服务） */
export interface McpPresetDef {
  /** 预设 id（用于 API 调用，如 'fuyao' / 'eastmoney'） */
  id: string
  /** UI 标题 */
  title: string
  /** UI 描述 */
  description: string
  /** 底层服务列表 */
  services: McpPresetServiceDef[]
  /** 推荐优先顺序（越小越前） */
  sortOrder: number
  /** 官网链接 */
  homepage?: string
}

/** 内置 MCP 预设 */
export const MCP_BUILTIN_PRESETS: McpPresetDef[] = [
  {
    id: 'fuyao',
    title: '同花顺（扶摇）',
    description: 'A 股行情、指数与元数据。一个配置覆盖三个后端服务。',
    sortOrder: 0,
    homepage: 'https://fuyao.aicubes.cn/?ref=opptrix',
    services: [
      {
        serverId: 'fuyao-a-share',
        title: 'A 股行情',
        url: 'https://fuyao.aicubes.cn/mcp/a-share',
        apiKeyHeader: 'X-api-key',
      },
      {
        serverId: 'fuyao-a-share-index',
        title: 'A 股指数',
        url: 'https://fuyao.aicubes.cn/mcp/a-share-index',
        apiKeyHeader: 'X-api-key',
      },
      {
        serverId: 'fuyao-meta',
        title: '元数据',
        url: 'https://fuyao.aicubes.cn/mcp/meta',
        apiKeyHeader: 'X-api-key',
      },
    ],
  },
  {
    id: 'eastmoney',
    title: '东方财富（妙想）',
    description: '行情数据与资讯，通过东方财富妙想 MCP 接入。',
    sortOrder: 1,
    homepage: 'https://choice.eastmoney.com/mcp/?ref=opptrix',
    services: [
      {
        serverId: 'mx-ds-mcp',
        title: '东方财富 MCP',
        url: 'https://mxapi.eastmoney.com/mxds/mcp',
        apiKeyHeader: 'em_api_key',
      },
    ],
  },
]
