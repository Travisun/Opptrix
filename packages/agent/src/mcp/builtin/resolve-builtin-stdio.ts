/**
 * 本机 stdio 预设入口解析 — routes 与 hydrate 共用，避免两处 map 漂移。
 *
 * 落盘使用哨兵 `command: builtin-node` / `builtin-python`（禁止冻死本机绝对路径）；
 * 连接时 materialize：
 * - `builtin-node` + 空 args → 按 serverId 解析内置入口；非空 args → process.execPath
 * - `builtin-python` + 非空 args → resolvePythonRuntime().active_path；空 args → 明确报错
 */

import type { McpStdioTransportConfig } from '@opptrix/shared'
import { resolvePythonRuntime, type PythonRuntimeStatus } from '@opptrix/agent-workspace'
import { resolveIwencaiMcpStdioTransport } from './iwencai/resolve-stdio.js'
import { resolveWebsearchMcpStdioTransport } from './websearch/resolve-stdio.js'

/** 落盘/导出用哨兵 command；spawn 前须 materialize */
export const BUILTIN_NODE_COMMAND = 'builtin-node'

/** 自定义 Python MCP 哨兵；spawn 前须 materialize 为 active_path */
export const BUILTIN_PYTHON_COMMAND = 'builtin-python'

const BUILTIN_STDIO_SERVER_IDS = new Set(['iwencai', 'websearch'])

const STDIO_PRESET_RESOLVERS: Record<string, () => McpStdioTransportConfig> = {
  iwencai: resolveIwencaiMcpStdioTransport,
  websearch: resolveWebsearchMcpStdioTransport,
}

/** active_path 短缓存，避免每次连接都探测（≤60s） */
const PYTHON_PATH_CACHE_TTL_MS = 60_000

type PythonRuntimeResolver = () => Promise<PythonRuntimeStatus>

let resolvePythonRuntimeImpl: PythonRuntimeResolver = resolvePythonRuntime
let cachedPythonPath: { path: string; expiresAt: number } | null = null

/** 测试注入 resolvePythonRuntime；传 null 恢复默认 */
export function setResolvePythonRuntimeForTests(fn: PythonRuntimeResolver | null): void {
  resolvePythonRuntimeImpl = fn ?? resolvePythonRuntime
  cachedPythonPath = null
}

/** 测试用：清空 active_path 缓存 */
export function clearBuiltinPythonPathCacheForTests(): void {
  cachedPythonPath = null
}

export function isBuiltinStdioServerId(serverId: string): boolean {
  return BUILTIN_STDIO_SERVER_IDS.has(serverId)
}

/** 可移植落盘形态（无本机绝对路径） */
export function buildBuiltinNodeTransportSentinel(): McpStdioTransportConfig {
  return {
    transport: 'stdio',
    command: BUILTIN_NODE_COMMAND,
    args: [],
  }
}

export function isBuiltinNodeCommand(command: string): boolean {
  return command.trim() === BUILTIN_NODE_COMMAND
}

export function isBuiltinPythonCommand(command: string): boolean {
  return command.trim() === BUILTIN_PYTHON_COMMAND
}

/** args 末项是否像内置 stdio-entry（兼容旧库绝对路径） */
export function looksLikeBuiltinStdioEntryArgs(args: readonly string[] | undefined): boolean {
  if (!args?.length) return false
  const entry = args[args.length - 1] ?? ''
  return /stdio-entry\.(js|ts)$/.test(entry)
}

/**
 * 按 serverId 解析内置 stdio transport（真实 execPath + 绝对 entry）。
 * @returns 无对应 resolver 时 null；入口缺失时抛错（与原先 apply-preset 一致）
 */
export function resolveBuiltinStdioTransport(serverId: string): McpStdioTransportConfig | null {
  const resolve = STDIO_PRESET_RESOLVERS[serverId]
  if (!resolve) return null
  return resolve()
}

async function resolveActivePythonPath(): Promise<string> {
  const now = Date.now()
  if (cachedPythonPath && cachedPythonPath.expiresAt > now) {
    return cachedPythonPath.path
  }
  const status = await resolvePythonRuntimeImpl()
  if (!status.ready || !status.active_path) {
    throw new Error(
      status.message?.trim()
        || '尚未检测到可用的 Python。可在设置中安装托管版本，或先在系统中安装 Python。',
    )
  }
  cachedPythonPath = {
    path: status.active_path,
    expiresAt: now + PYTHON_PATH_CACHE_TTL_MS,
  }
  return status.active_path
}

/**
 * 连接前 materialize（async，因 Python 探测为异步）：
 * - `builtin-python` + 非空 args → 展开为 active_path，保留 args/cwd/env
 * - `builtin-python` + 空 args → 抛错（尚无按 id 的 Python 内置入口）
 * - `builtin-node` + 空 args → 按 serverId 解析内置 stdio-entry
 * - `builtin-node` + 非空 args → 仅展开 command 为 process.execPath
 * - 旧库绝对路径（known id + looksLikeBuiltinStdioEntry）→ 重解析
 * - 其他配置原样透传
 */
export async function materializeBuiltinStdioTransport(
  serverId: string,
  cfg: McpStdioTransportConfig,
): Promise<McpStdioTransportConfig> {
  if (cfg.transport !== 'stdio') return cfg

  const userArgs = cfg.args ?? []

  if (isBuiltinPythonCommand(cfg.command)) {
    if (userArgs.length === 0) {
      throw new Error(
        '请补充 Python 脚本的绝对路径。目前还不支持仅凭服务编号启动内置 Python 入口。',
      )
    }
    const pythonPath = await resolveActivePythonPath()
    return {
      ...cfg,
      command: pythonPath,
      args: [...userArgs],
    }
  }

  const isSentinel = isBuiltinNodeCommand(cfg.command)
  if (isSentinel && userArgs.length > 0) {
    return {
      ...cfg,
      command: process.execPath,
      args: [...userArgs],
    }
  }

  const isLegacyBuiltinPath =
    isBuiltinStdioServerId(serverId) && looksLikeBuiltinStdioEntryArgs(cfg.args)

  if (!isSentinel && !isLegacyBuiltinPath) return cfg

  const resolved = resolveBuiltinStdioTransport(serverId)
  if (!resolved) {
    throw new Error(`无法解析内置 MCP 入口: ${serverId}`)
  }
  return resolved
}
