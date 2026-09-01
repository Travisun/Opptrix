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

/** 从外部 MCP 错误消息提取配置提示（不含密钥明文） */
export function extractMcpConfigHint(error: unknown): string | undefined {
  const msg = error instanceof Error ? error.message : String(error ?? '')
  if (/missing\s+x-api-key/i.test(msg)) {
    return '请在 MCP 服务器设置中配置 API Key'
  }
  if (/invalid\s+api\s*key/i.test(msg)) {
    return 'API Key 无效，请检查设置'
  }
  if (/\bunauthorized\b/i.test(msg)) {
    return '鉴权失败，请检查 MCP 服务器密钥配置'
  }
  return undefined
}

/** 外部 MCP 错误分类（编排器 / 熔断 / 会话隔离用） */
export type McpErrorClass =
  | 'rate_limited'
  | 'hard_unavailable'
  | 'transient'
  | 'business'

function mcpErrorStatus(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null || !('status' in error)) return undefined
  const status = Number((error as { status: unknown }).status)
  return Number.isFinite(status) ? status : undefined
}

function mcpErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error ?? '')
}

/**
 * 分类外部 MCP 调用错误。
 * - rate_limited：429 / quota / 限流（短重试，不进会话隔离、不立刻熔断）
 * - hard_unavailable：401/403 / 缺钥 / unauthorized / 握手失败（会话隔离）
 * - transient：超时 / 5xx / 连接失败（无法连接、Connection refused、ECONNRESET 等）/ schema 漂移（可换源）
 * - business：invalid argument 等（不换源）
 */
export function classifyMcpServerError(error: unknown): McpErrorClass {
  const msg = mcpErrorMessage(error)
  const status = mcpErrorStatus(error)

  if (!msg.trim() && status === undefined) return 'business'

  if (/invalid\s+argument|unknown\s+symbol|invalid\s+parameter/i.test(msg)) {
    return 'business'
  }

  if (
    status === 429
    || /quota|rate\s*limit|too\s*many|429|credit|额度过|额度用尽|限流|请求过于频繁/i.test(msg)
  ) {
    return 'rate_limited'
  }

  if (
    status === 401
    || status === 403
    || /\b(401|403)\b/.test(msg)
    || /missing\s+x-api-key|invalid\s+api\s*key|\bunauthorized\b/i.test(msg)
    || /handshake\s+failed|握手失败/i.test(msg)
  ) {
    return 'hard_unavailable'
  }

  if (
    (status !== undefined && status >= 500)
    || /\b(502|503|504)\b/.test(msg)
    || /ECONN|ETIMEDOUT|ENOTFOUND|fetch failed|timeout|超时|unavailable|不可用/i.test(msg)
    || /无法连接|connection refused|econnreset|socket hang up|connect failed/i.test(msg)
  ) {
    return 'transient'
  }

  if (
    /-32602\b/.test(msg)
    && /Structured content does not match|Failed to validate structured content/i.test(msg)
  ) {
    return 'transient'
  }
  if (
    /-32600\b/.test(msg)
    && /output schema but did not return structured content/i.test(msg)
  ) {
    return 'transient'
  }

  return 'business'
}

/**
 * 从错误中解析 Retry-After（毫秒），夹紧到 1000–5000；无则默认 1500。
 * 不记录密钥明文。
 */
export function parseMcpRetryAfterMs(error: unknown): number {
  const DEFAULT_MS = 1500
  const MIN_MS = 1000
  const MAX_MS = 5000
  let raw: number | undefined

  if (typeof error === 'object' && error !== null) {
    const obj = error as Record<string, unknown>
    if (typeof obj.retryAfterMs === 'number' && Number.isFinite(obj.retryAfterMs)) {
      raw = obj.retryAfterMs
    } else if (typeof obj.retryAfter === 'number' && Number.isFinite(obj.retryAfter)) {
      raw = obj.retryAfter < 100 ? obj.retryAfter * 1000 : obj.retryAfter
    } else if (obj.headers && typeof obj.headers === 'object' && obj.headers !== null) {
      const h = obj.headers as Record<string, unknown>
      const ra = h['retry-after'] ?? h['Retry-After']
      if (typeof ra === 'string' || typeof ra === 'number') {
        const n = Number(ra)
        if (Number.isFinite(n)) raw = n < 100 ? n * 1000 : n
      }
    }
  }

  if (raw === undefined) {
    const msg = mcpErrorMessage(error)
    const m = /retry[-_\s]?after[:\s]+(\d+(?:\.\d+)?)/i.exec(msg)
    if (m) {
      const n = Number(m[1])
      if (Number.isFinite(n)) raw = n < 100 ? n * 1000 : n
    }
  }

  const ms = raw ?? DEFAULT_MS
  return Math.min(MAX_MS, Math.max(MIN_MS, Math.floor(ms)))
}

/** 判定外部调用失败是否应 failover / 熔断（业务参数错误不在此列） */
export function isMcpServerFailoverError(error: unknown): boolean {
  return classifyMcpServerError(error) !== 'business'
}

// ────────────────────────────────────────────
// 内置 MCP 预设 — HTTP/问财需数据密钥；网页搜索等本机 stdio 可无密钥
// ────────────────────────────────────────────

/** 预设中单个底层 MCP 服务的定义（HTTP 或本机 stdio） */
export interface McpPresetServiceDef {
  /** 创建后 MCP Server 的 id */
  serverId: string
  /** UI 显示名称 */
  title: string
  /**
   * 传输类型；缺省 `streamable-http`（兼容旧预设）。
   * `stdio` 时由 apply-preset 解析本机 command/args；
   * 有 `apiKeyEnv` 时密钥写入 secrets[apiKeyEnv]，无密钥预设写 `secrets: {}`。
   */
  transport?: 'stdio' | 'streamable-http'
  /** Streamable HTTP URL（HTTP 预设必填） */
  url?: string
  /** HTTP：API Key 所在 header（勿与问财 env 混用） */
  apiKeyHeader?: string
  /** stdio：密钥写入 secrets 的环境变量名（如 IWENCAI_API_KEY）；无密钥预设省略 */
  apiKeyEnv?: string
}

/** 预设服务用于读写 secrets 的 key（env 名或 header 名）；无密钥时为空串 */
export function mcpPresetSecretKey(svc: Pick<McpPresetServiceDef, 'apiKeyEnv' | 'apiKeyHeader'>): string {
  return (svc.apiKeyEnv ?? svc.apiKeyHeader ?? '').trim()
}

/** 预设是否要求 apply-preset 提交 apiKey（任一 service 有 secret key） */
export function mcpPresetRequiresApiKey(preset: Pick<McpPresetDef, 'services'>): boolean {
  return preset.services.some(s => Boolean(mcpPresetSecretKey(s)))
}

/** 一个预设的定义（UI 展示为一个卡片，可能对应多个底层服务） */
export interface McpPresetDef {
  /** 预设 id（用于 API 调用，如 'fuyao' / 'eastmoney' / 'iwencai' / 'websearch'） */
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
    homepage: 'https://opptrix.net/t/topic/199',
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
    homepage: 'https://opptrix.net/t/topic/200',
    services: [
      {
        serverId: 'mx-ds-mcp',
        title: '东方财富 MCP',
        url: 'https://mxapi.eastmoney.com/mxds/mcp',
        apiKeyHeader: 'em_api_key',
      },
    ],
  },
  {
    id: 'iwencai',
    title: '问财',
    description: '用自然语言选股，并检索新闻、公告与研报。',
    sortOrder: 2,
    homepage: 'https://opptrix.net/t/topic/203',
    services: [
      {
        serverId: 'iwencai',
        title: '问财',
        transport: 'stdio',
        apiKeyEnv: 'IWENCAI_API_KEY',
      },
    ],
  },
  {
    id: 'websearch',
    title: '网页搜索',
    description: '检索一般公开资料，不是行情或公告来源。无需数据密钥。中文优先国内来源，其他语言走国际来源。',
    sortOrder: 3,
    services: [
      {
        serverId: 'websearch',
        title: '网页搜索',
        transport: 'stdio',
      },
    ],
  },
]
