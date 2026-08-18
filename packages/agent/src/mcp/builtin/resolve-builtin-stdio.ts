/**
 * 本机 stdio 预设入口解析 — routes 与 hydrate 共用，避免两处 map 漂移。
 */

import type { McpStdioTransportConfig } from '@opptrix/shared'
import { resolveIwencaiMcpStdioTransport } from './iwencai/resolve-stdio.js'
import { resolveWebsearchMcpStdioTransport } from './websearch/resolve-stdio.js'

const STDIO_PRESET_RESOLVERS: Record<string, () => McpStdioTransportConfig> = {
  iwencai: resolveIwencaiMcpStdioTransport,
  websearch: resolveWebsearchMcpStdioTransport,
}

/**
 * 按 serverId 解析内置 stdio transport。
 * @returns 无对应 resolver 时 null；入口缺失时抛错（与原先 apply-preset 一致）
 */
export function resolveBuiltinStdioTransport(serverId: string): McpStdioTransportConfig | null {
  const resolve = STDIO_PRESET_RESOLVERS[serverId]
  if (!resolve) return null
  return resolve()
}
