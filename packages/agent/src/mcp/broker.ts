import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import type { ToolRegistry, OpenAiTool, JsonSchema } from '../tools.js'
import { createMcpServer } from './server.js'

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

  async call(name: string, args: Record<string, unknown> = {}): Promise<unknown> {
    if (!this.connected) throw new Error('MCP broker not connected')
    const result = await this.client.callTool({ name, arguments: args })
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
