/**
 * 聚合工具 Broker：外部 MCP 优先 + 充分性保障 + 本地兜底。
 *
 * 改造要点（对齐"外部优先 + 投研完备性"目标）：
 * 1. openAiTools() 返回 [外部工具(排前), 本地过滤工具(排后)]
 *    外部已有的同名工具，本地不再重复暴露
 * 2. call() 外部优先，调用后做充分性校验：
 *    - 充分 → 直接返回（标记 sufficient=true）
 *    - 不充分 → 自动补充本地数据，按策略合并后返回
 *    - 外部不可用 → 降级本地（标记 degraded=true）
 * 3. 所有结果都带 _mcp 标记，告知 LLM 数据来源和充分性
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
import { SufficiencyChecker, TOOL_SUFFICIENCY_SPECS } from './sufficiency.js'
import { mergeResults, extendResults, replaceResults } from './supplement.js'

export class AggregatingToolBroker {
  private sufficiency = new SufficiencyChecker(TOOL_SUFFICIENCY_SPECS)

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

  /**
   * 工具目录：外部工具排前，本地仅暴露外部没有的工具。
   * 部分模型对靠前 schema 更敏感，外部优先排序提升外部工具被选中的概率。
   */
  async openAiTools(): Promise<OpenAiTool[]> {
    const ext = await this.external.listNamespacedOpenAiTools()
    // 收集外部已暴露的工具名（含命名空间和原始名）
    const externalNames = new Set<string>()
    for (const t of ext) {
      externalNames.add(t.function.name)
      const parsed = parseNamespacedMcpTool(t.function.name)
      if (parsed) externalNames.add(parsed.toolName)
    }
    // 本地仅暴露外部没有的同名工具
    const localTools = await this.local.openAiFilteredTools(externalNames)
    return [...ext, ...localTools]
  }

  async call(
    name: string,
    args: Record<string, unknown> = {},
    opts?: McpToolCallOptions,
  ): Promise<unknown> {
    // ── 命名空间工具：直接走外部 ──
    if (parseNamespacedMcpTool(name)) {
      return this.callNamespaced(name, args, opts)
    }

    // ── 绑定链：按 sortOrder 尝试外部候选 ──
    const chain = this.external.resolveBindingChain(name)
    if (chain.length > 0) {
      const result = await this.tryExternalChain(name, args, opts, chain)
      if (result !== null) return result
    }

    // ── 无绑定链：检查外部是否有同名工具（自动绑定场景） ──
    const autoBound = this.external.resolveAutoBindChain(name)
    if (autoBound.length > 0) {
      const result = await this.tryExternalChain(name, args, opts, autoBound)
      if (result !== null) return result
    }

    // ── 兜底本地 ──
    return this.callLocalWithFallback(name, args, opts, chain.length > 0 || autoBound.length > 0)
  }

  /* ---------------------------------------------------------------------- */
  /* 内部实现                                                                */
  /* ---------------------------------------------------------------------- */

  /** 调用命名空间工具（外部） */
  private async callNamespaced(
    name: string,
    args: Record<string, unknown>,
    opts?: McpToolCallOptions,
  ): Promise<unknown> {
    try {
      const result = await this.external.callNamespaced(name, args, opts)
      const parsed = parseNamespacedMcpTool(name)!
      const check = this.sufficiency.check(name, result)
      if (check.sufficient) {
        return annotateMcpResult(result, parsed.serverId, { sufficient: true })
      }
      // 不充分 → 补充本地
      return this.supplementWithLocal(name, args, opts, result, check, parsed.serverId)
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) }
    }
  }

  /** 尝试外部绑定链，返回 null 表示全部失败需降级本地 */
  private async tryExternalChain(
    name: string,
    args: Record<string, unknown>,
    opts: McpToolCallOptions | undefined,
    chain: Array<{ serverId: string; remoteTool: string }>,
  ): Promise<unknown | null> {
    let lastExternalResult: unknown = null
    let lastCheck: ReturnType<SufficiencyChecker['check']> | null = null
    let lastServerId = ''

    for (const cand of chain) {
      try {
        const result = await this.external.callExternal(
          cand.serverId,
          cand.remoteTool,
          args,
          opts,
        )
        const check = this.sufficiency.check(name, result)
        if (check.sufficient) {
          // 外部数据已完备，直接返回
          return annotateMcpResult(result, cand.serverId, { sufficient: true })
        }
        // 不充分：记录，继续尝试下一个外部源
        lastExternalResult = result
        lastCheck = check
        lastServerId = cand.serverId
      } catch (e) {
        if (isMcpServerFailoverError(e)) continue
        // 业务错误：不换源，直接返回
        return { error: e instanceof Error ? e.message : String(e), _mcp: { source: cand.serverId } }
      }
    }

    // 所有外部源都不充分 → 补充本地
    if (lastExternalResult !== null && lastCheck) {
      return this.supplementWithLocal(name, args, opts, lastExternalResult, lastCheck, lastServerId)
    }

    // 外部全部失败（无结果）
    return null
  }

  /** 补充本地数据并合并 */
  private async supplementWithLocal(
    name: string,
    args: Record<string, unknown>,
    opts: McpToolCallOptions | undefined,
    externalResult: unknown,
    check: ReturnType<SufficiencyChecker['check']>,
    externalSource: string,
  ): Promise<unknown> {
    const strategy = this.sufficiency.strategyFor(name) ?? 'merge'
    const note = this.sufficiency.noteFor(name) ?? check.reason

    try {
      const localResult = await this.local.call(name, args, opts)
      let merged: unknown
      switch (strategy) {
        case 'extend':
          merged = extendResults(name, externalResult, localResult)
          break
        case 'replace':
          merged = replaceResults(name, externalResult, localResult)
          break
        case 'merge':
        default:
          merged = mergeResults(name, externalResult, localResult)
          break
      }
      return annotateMcpResult(merged, 'external+local', {
        sufficient: true,
        supplemented: true,
        supplementReason: note,
        externalSource,
        missingFields: check.missingFields,
      })
    } catch (e) {
      // 本地补充失败，返回外部结果 + 警告
      return annotateMcpResult(externalResult, externalSource, {
        sufficient: false,
        supplemented: false,
        supplementError: e instanceof Error ? e.message : String(e),
        missingFields: check.missingFields,
      })
    }
  }

  /** 降级本地调用 */
  private async callLocalWithFallback(
    name: string,
    args: Record<string, unknown>,
    opts: McpToolCallOptions | undefined,
    externalTried: boolean,
  ): Promise<unknown> {
    const localResult = await this.local.call(name, args, opts)
    return annotateMcpResult(localResult, 'local', {
      degraded: externalTried,
      sufficient: !externalTried, // 未尝试外部时，本地视为充分
    })
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
export { SufficiencyChecker, TOOL_SUFFICIENCY_SPECS } from './sufficiency.js'
export { mergeResults, extendResults, replaceResults } from './supplement.js'
