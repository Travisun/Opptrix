import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const DATA_ROOT = process.env.INNO_MARKET_DATA_DIR ?? path.join(os.homedir(), '.a_stock_layer')

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

export function resolveProjectRoot(start = process.cwd()): string {
  let dir = path.resolve(start)
  for (let i = 0; i < 10; i++) {
    const pkgPath = path.join(dir, 'package.json')
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as { name?: string; workspaces?: unknown }
        if (pkg.name === 'inno-a-stock' || pkg.workspaces) return dir
      } catch { /* continue */ }
    }
    const parent = path.dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return process.cwd()
}

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

export function getSystemInfo() {
  const now = new Date()
  return {
    platform: process.platform,
    arch: process.arch,
    node_version: process.version,
    runtime: process.env.INNO_DESKTOP === '1' ? 'desktop' : 'node',
    desktop: process.env.INNO_DESKTOP === '1',
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
  const agentPkgRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
  return {
    async getAppSettings() {
      return {
        source: 'standalone_mcp',
        llm_configured: false,
        default_scorecard: process.env.DEFAULT_SCORECARD ?? '综合评估',
        default_top_n: Number(process.env.DEFAULT_TOP_N ?? 20),
        hint: '完整 LLM 提供商与默认模型请通过 innoAStock 服务端 /api/config 或 UI 设置查看',
      }
    },
    async getProjectInfo() {
      return {
        app: 'innoAStock',
        component: 'agent-mcp',
        version: '0.6.0',
        runtime: process.env.INNO_DESKTOP === '1' ? 'desktop' : 'node',
        project_root: resolveProjectRoot(),
        agent_package: agentPkgRoot,
        paths: getDataLayerPaths(),
      }
    },
  }
}
