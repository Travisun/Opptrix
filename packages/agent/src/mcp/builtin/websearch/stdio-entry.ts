#!/usr/bin/env node
/**
 * 网页搜索本机 MCP — stdio 入口（无 API Key）。
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'
import { callWebsearchMcpTool, WEBSEARCH_MCP_TOOLS } from './tools.js'

const server = new Server(
  { name: 'opptrix-websearch', version: '1.0.0' },
  { capabilities: { tools: {} } },
)

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: WEBSEARCH_MCP_TOOLS.map(t => ({
    name: t.name,
    description: t.description,
    inputSchema: t.inputSchema,
  })),
}))

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const name = request.params.name
  const args = (request.params.arguments ?? {}) as Record<string, unknown>
  try {
    const result = await callWebsearchMcpTool(name, args)
    return {
      content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
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
