import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js'
import type { ToolRegistry, OpenAiTool, JsonSchema } from '../tools.js'
import { createMcpServer } from './server.js'

/** MCP SDK 默认 60s；选股挖掘/在线扫描等常超过该值 */
export const MCP_TOOL_CALL_TIMEOUT_MS = 300_000
/** 全市场扫描、深度诊断等重工具 */
export const MCP_SLOW_TOOL_CALL_TIMEOUT_MS = 900_000

const SLOW_TOOLS = new Set([
  'screen_stocks',
  'local_screen_stocks',
  'screen_local_universe',
  'trigger_market_db_sync',
  'evaluate_stock',
  'get_stock_detail',
  'get_watchlist_radar',
  'run_backtest',
  'strategy_verify',
  'industry_mining',
])

export interface McpToolCallOptions {
  signal?: AbortSignal
  timeoutMs?: number
}

function toolCallTimeoutMs(name: string, override?: number): number {
  if (override != null) return override
  return SLOW_TOOLS.has(name) ? MCP_SLOW_TOOL_CALL_TIMEOUT_MS : MCP_TOOL_CALL_TIMEOUT_MS
}

function formatToolTimeoutError(name: string): string {
  return `工具 ${name} 执行超时（数据拉取或计算耗时较长）。请确认本地初选库已就绪，或缩小筛选范围后重试。`
}

/**
 * 进程内 MCP 客户端：Agent 与数据层工具的唯一运行时通道。
 * LLM 仍使用 OpenAI function-calling 格式，但 list/call 均经 MCP 协议转发至 ToolRegistry。
 */
export class McpToolBroker {
  private readonly client: Client
  private connected = false

  private constructor(
    private readonly registry: ToolRegistry,
    private readonly toolNames: readonly string[] | null,
  ) {
    this.client = new Client({ name: 'inno-a-stock-agent', version: '0.6.0' })
  }

  /** @param toolNames null = 全部工具；传数组 = 白名单子集（如挖掘场景） */
  static async create(registry: ToolRegistry, toolNames: readonly string[] | null = null) {
    const broker = new McpToolBroker(registry, toolNames)
    await broker.connect()
    return broker
  }

  private async connect() {
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
    const server = createMcpServer(this.registry, { toolNames: this.toolNames })
    await server.connect(serverTransport)
    await this.client.connect(clientTransport)
    this.connected = true
  }

  async openAiTools(): Promise<OpenAiTool[]> {
    if (!this.connected) throw new Error('MCP broker not connected')
    const { tools } = await this.client.listTools()
    return tools.map(t => ({
      type: 'function' as const,
      function: {
        name: t.name,
        description: t.description ?? '',
        parameters: (t.inputSchema ?? { type: 'object', properties: {} }) as JsonSchema,
      },
    }))
  }

  async call(
    name: string,
    args: Record<string, unknown> = {},
    opts?: McpToolCallOptions,
  ): Promise<unknown> {
    if (!this.connected) throw new Error('MCP broker not connected')
    const timeout = toolCallTimeoutMs(name, opts?.timeoutMs)
    let result
    try {
      result = await this.client.callTool(
        { name, arguments: args },
        undefined,
        {
          timeout,
          maxTotalTimeout: timeout * 2,
          signal: opts?.signal,
        },
      )
    } catch (e) {
      if (e instanceof McpError && e.code === ErrorCode.RequestTimeout) {
        return { error: formatToolTimeoutError(name) }
      }
      if (opts?.signal?.aborted) {
        return { error: '已取消' }
      }
      throw e
    }
    const content = Array.isArray(result.content) ? result.content : []
    const text = content
      .filter((c): c is { type: 'text'; text: string } =>
        typeof c === 'object' && c !== null && (c as { type?: string }).type === 'text'
        && typeof (c as { text?: unknown }).text === 'string',
      )
      .map(c => c.text)
      .join('\n')
    if (result.isError) {
      if (!text) return { error: 'tool call failed' }
      try {
        return JSON.parse(text) as unknown
      } catch {
        return { error: text }
      }
    }
    if (!text) return result
    try {
      return JSON.parse(text) as unknown
    } catch {
      return text
    }
  }

  async close() {
    if (this.connected) {
      await this.client.close()
      this.connected = false
    }
  }
}
