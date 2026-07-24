import path from 'node:path'
import { isDesktopRuntime, resolveUserDataRoot } from '@opptrix/shared'

const DATA_ROOT = resolveUserDataRoot()

export interface PublicAppSettings {
  providers: Array<{
    id: string
    name: string
    base_url: string
    models: string[]
    api_key_configured: boolean
  }>
  available_models: Array<{
    ref: string
    model: string
    provider_id: string
    provider_name: string
  }>
  default_model?: string
  default_scorecard: string
  default_top_n: number
  llm_configured: boolean
}

/** 服务端注入；stdio MCP 使用默认实现 */
export interface AgentAppContext {
  getAppSettings(): Promise<PublicAppSettings | Record<string, unknown>>
  getProjectInfo?(): Promise<Record<string, unknown>>
}

export { resolveProjectRoot } from '@opptrix/shared'

/** 内部用：完整数据层路径（勿直接暴露给 Agent / LLM） */
export function getDataLayerPaths() {
  return {
    data_root: DATA_ROOT,
    market_data_dir: DATA_ROOT,
    sessions_dir: path.join(DATA_ROOT, 'sessions'),
    watchlist_file: path.join(DATA_ROOT, 'watchlist.json'),
    portfolio_dir: DATA_ROOT,
    tushare_config: path.join(DATA_ROOT, 'tushare-config.json'),
  }
}

const AGENT_WORKSPACE_NOTE =
  'Agent 可访问目录请调用 list_workspace_grants；本工具不返回应用数据根或内部路径'

/** Agent 可见：数据层摘要（无 ~/.opptrix 绝对路径） */
export function getAgentSafeDataLayerSummary(): Record<string, unknown> {
  return {
    user_data_configured: true,
    workspace_note: AGENT_WORKSPACE_NOTE,
  }
}

/**
 * 脱敏 project info — 去掉 paths / project_root / agent_package 等敏感或易误导字段。
 * 供 get_project_info 工具与服务端注入共用。
 */
export function buildAgentSafeProjectInfo(
  fields: Record<string, unknown>,
): Record<string, unknown> {
  const safe = { ...fields }
  delete safe.paths
  delete safe.project_root
  delete safe.agent_package
  return {
    ...safe,
    ...getAgentSafeDataLayerSummary(),
    note: '运行环境元数据，不是用户授权目录清单；询问可访问目录请用 list_workspace_grants',
  }
}

export function getSystemInfo() {
  const now = new Date()
  return {
    platform: process.platform,
    arch: process.arch,
    node_version: process.version,
    runtime: isDesktopRuntime() ? 'desktop' : 'node',
    desktop: isDesktopRuntime(),
    pid: process.pid,
    cwd: process.cwd(),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    locale: Intl.DateTimeFormat().resolvedOptions().locale,
    memory_mb: {
      rss: Math.round(process.memoryUsage().rss / 1024 / 1024),
      heap_used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
    },
    at: now.toISOString(),
  }
}

export function getCurrentTime() {
  const now = new Date()
  return {
    iso: now.toISOString(),
    local: now.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }),
    timezone: 'Asia/Shanghai',
    unix_ms: now.getTime(),
    weekday: now.toLocaleDateString('zh-CN', { weekday: 'long', timeZone: 'Asia/Shanghai' }),
  }
}

export function createDefaultAppContext(): AgentAppContext {
  return {
    async getAppSettings() {
      return {
        source: 'standalone_mcp',
        llm_configured: false,
        default_scorecard: process.env.DEFAULT_SCORECARD ?? 'G=B+M',
        default_top_n: Number(process.env.DEFAULT_TOP_N ?? 20),
        hint: '完整 LLM 提供商与默认模型请通过 Opptrix 服务端 /api/config 或 UI 设置查看',
      }
    },
    async getProjectInfo() {
      return buildAgentSafeProjectInfo({
        app: 'Opptrix',
        component: 'agent-mcp',
        version: '0.6.0',
        runtime: isDesktopRuntime() ? 'desktop' : 'node',
      })
    },
  }
}
