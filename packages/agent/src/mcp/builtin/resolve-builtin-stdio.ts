/**
 * 本机 stdio 预设入口解析 — routes 与 hydrate 共用，避免两处 map 漂移。
 *
 * 落盘使用哨兵 `command: builtin-node`（禁止冻死 Homebrew/用户目录绝对路径）；
 * 连接时 materialize：空 args 按 serverId 解析内置入口；非空 args 仅展开 command 为
 * process.execPath，保留用户脚本路径。
 */

import type { McpStdioTransportConfig } from '@opptrix/shared'
import { resolveIwencaiMcpStdioTransport } from './iwencai/resolve-stdio.js'
import { resolveWebsearchMcpStdioTransport } from './websearch/resolve-stdio.js'

/** 落盘/导出用哨兵 command；spawn 前须 materialize */
export const BUILTIN_NODE_COMMAND = 'builtin-node'

const BUILTIN_STDIO_SERVER_IDS = new Set(['iwencai', 'websearch'])

const STDIO_PRESET_RESOLVERS: Record<string, () => McpStdioTransportConfig> = {
  iwencai: resolveIwencaiMcpStdioTransport,
  websearch: resolveWebsearchMcpStdioTransport,
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

/**
 * 连接前 materialize：
 * - `builtin-node` + 空 args → 按 serverId 解析内置 stdio-entry
 * - `builtin-node` + 非空 args → 仅展开 command 为 process.execPath，保留用户 args/cwd/env
 * - 旧库绝对路径（known id + looksLikeBuiltinStdioEntry）→ 重解析
 * - 其他配置原样透传
 */
export function materializeBuiltinStdioTransport(
  serverId: string,
  cfg: McpStdioTransportConfig,
): McpStdioTransportConfig {
  if (cfg.transport !== 'stdio') return cfg

  const isSentinel = isBuiltinNodeCommand(cfg.command)
  const userArgs = cfg.args ?? []
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
