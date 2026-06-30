import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'
import type { ToolRegistry } from '../tools.js'

export interface CreateMcpServerOptions {
  /** null = 暴露全部工具（默认）；传数组 = 仅暴露白名单子集 */
  toolNames?: readonly string[] | null
}

export function createMcpServer(
  registry: ToolRegistry,
  opts: CreateMcpServerOptions = {},
) {
  const toolNames = opts.toolNames === undefined ? null : opts.toolNames

  const server = new Server(
    { name: 'opptrix-data', version: '0.6.0' },
    { capabilities: { tools: {} } },
  )

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: registry.mcpTools(toolNames ?? undefined),
  }))

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const name = request.params.name
    const args = (request.params.arguments ?? {}) as Record<string, unknown>
    const result = await registry.call(name, args)
    const text = typeof result === 'string' ? result : JSON.stringify(result, null, 2)
    const isError = Boolean(result && typeof result === 'object' && 'error' in result)
    return {
      content: [{ type: 'text' as const, text }],
      isError,
    }
  })

  return server
}

export async function runMcpStdio(registry: ToolRegistry, opts?: CreateMcpServerOptions) {
  const server = createMcpServer(registry, opts)
  const transport = new StdioServerTransport()
  await server.connect(transport)
}
