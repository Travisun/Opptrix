/**
 * hydrate 前为无密钥内置 stdio 预设落库；已有记录不改开关，避免用户关掉后又被打开。
 */

import {
  MCP_BUILTIN_PRESETS,
  mcpPresetRequiresApiKey,
  type McpPresetDef,
  type McpServerCreateInput,
  type McpServerRecord,
  type McpStdioTransportConfig,
} from '@opptrix/shared'
import {
  buildBuiltinNodeTransportSentinel,
  resolveBuiltinStdioTransport,
} from '../builtin/resolve-builtin-stdio.js'

export type BuiltinStdioResolver = (serverId: string) => McpStdioTransportConfig | null

export interface EnsureDefaultKeylessMcpDeps {
  get: (id: string) => McpServerRecord | null
  create: (input: McpServerCreateInput) => McpServerRecord
  resolveStdio?: BuiltinStdioResolver
}

function tryResolveStdio(
  resolveStdio: BuiltinStdioResolver,
  serverId: string,
): McpStdioTransportConfig | null {
  try {
    return resolveStdio(serverId)
  } catch {
    // 入口未构建时跳过，不阻断 hydrate
    return null
  }
}

/**
 * 为「无密钥 + stdio + 能 resolve 入口」的内置预设 create 一条 enabled 记录。
 * 已有记录（含 enabled:false）原样保留。
 * @returns 本次新建的 serverId 列表
 */
export function ensureDefaultKeylessMcpServers(
  deps: EnsureDefaultKeylessMcpDeps,
  presets: readonly McpPresetDef[] = MCP_BUILTIN_PRESETS,
): string[] {
  const resolveStdio = deps.resolveStdio ?? resolveBuiltinStdioTransport
  const created: string[] = []

  for (const preset of presets) {
    if (mcpPresetRequiresApiKey(preset)) continue
    for (const svc of preset.services) {
      if (svc.transport !== 'stdio') continue
      if (deps.get(svc.serverId)) continue
      // 仅校验入口可解析；落盘写哨兵，禁止冻死本机绝对路径
      const transport = tryResolveStdio(resolveStdio, svc.serverId)
      if (!transport || transport.transport !== 'stdio') continue
      try {
        deps.create({
          id: svc.serverId,
          title: svc.title,
          enabled: true,
          paused: false,
          transportConfig: buildBuiltinNodeTransportSentinel(),
          secrets: {},
          installSource: 'registry',
        })
        created.push(svc.serverId)
      } catch {
        // 并发下可能已存在；不改 enabled/paused
      }
    }
  }

  return created
}
