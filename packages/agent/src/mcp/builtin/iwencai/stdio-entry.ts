#!/usr/bin/env node
/**
 * 问财本机 MCP — stdio 入口。
 * 密钥：环境变量 IWENCAI_API_KEY（由 ExternalMcpRegistry secrets 注入）。
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'
import { callIwencaiMcpTool, IWENCAI_MCP_TOOLS } from './tools.js'

const server = new Server(
  { name: 'opptrix-iwencai', version: '1.0.0' },
  { capabilities: { tools: {} } },
)

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: IWENCAI_MCP_TOOLS.map(t => ({
    name: t.name,
    description: t.description,
    inputSchema: t.inputSchema,
  })),
}))

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const name = request.params.name
  const args = (request.params.arguments ?? {}) as Record<string, unknown>
  try {
    const result = await callIwencaiMcpTool(name, args)
    const text = typeof result === 'string' ? result : JSON.stringify(result, null, 2)
    return {
      content: [{ type: 'text' as const, text }],
      isError: false,
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return {
      content: [{ type: 'text' as const, text: JSON.stringify({ error: msg }) }],
      isError: true,
    }
  }
})

async function main() {
  const transport = new StdioServerTransport()
  await server.connect(transport)
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err))
  process.exit(1)
})
