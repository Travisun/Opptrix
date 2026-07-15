/**
 * 聚合工具 Broker：本地 InMemory MCP + 外部 MCP 优先级故障转移。
 */

import {
  isMcpServerFailoverError,
  parseNamespacedMcpTool,
} from '@opptrix/shared'
import type { OpenAiTool } from '../../tools.js'
import { McpToolBroker, type McpToolCallOptions } from '../broker.js'
import {
  annotateMcpResult,
  getExternalMcpRegistry,
  type ExternalMcpRegistry,
} from './registry.js'

export class AggregatingToolBroker {
  private constructor(
    private readonly local: McpToolBroker,
    private readonly external: ExternalMcpRegistry,
  ) {}

  static async create(
    createLocal: () => Promise<McpToolBroker>,
    external: ExternalMcpRegistry = getExternalMcpRegistry(),
  ): Promise<AggregatingToolBroker> {
    await external.hydrate()
    const local = await createLocal()
    return new AggregatingToolBroker(local, external)
  }

  async openAiTools(): Promise<OpenAiTool[]> {
    const localTools = await this.local.openAiTools()
    const ext = await this.external.listNamespacedOpenAiTools()
    return [...localTools, ...ext]
  }

  async call(
    name: string,
    args: Record<string, unknown> = {},
    opts?: McpToolCallOptions,
  ): Promise<unknown> {
    if (parseNamespacedMcpTool(name)) {
      try {
        const result = await this.external.callNamespaced(name, args, opts)
        const parsed = parseNamespacedMcpTool(name)!
        return annotateMcpResult(result, parsed.serverId)
      } catch (e) {
        return { error: e instanceof Error ? e.message : String(e) }
      }
    }

    const chain = this.external.resolveBindingChain(name)
    const tried: string[] = []
    for (const cand of chain) {
      tried.push(cand.serverId)
      try {
        const result = await this.external.callExternal(
          cand.serverId,
          cand.remoteTool,
          args,
          opts,
        )
        return annotateMcpResult(result, cand.serverId)
      } catch (e) {
        if (isMcpServerFailoverError(e)) continue
        // 业务错误：不换源，直接返回
        return { error: e instanceof Error ? e.message : String(e), _mcp: { source: cand.serverId } }
      }
    }

    const localResult = await this.local.call(name, args, opts)
    return annotateMcpResult(localResult, 'local', { degraded: tried.length > 0 })
  }

  async close(): Promise<void> {
    await this.local.close()
  }
}

export {
  annotateMcpResult,
  getExternalMcpRegistry,
  resetExternalMcpRegistry,
  ExternalMcpRegistry,
} from './registry.js'
export { ExternalMcpHealth } from './health.js'
export { createSdkConnection, parseToolResult, toOpenAiTool, type SdkConnection } from './connection.js'
