import test from 'node:test'
import assert from 'node:assert/strict'
import { ToolRegistry } from '../packages/agent/dist/tools.js'
import { ResearchHub } from '../packages/research-hub/dist/hub.js'
import { buildIndustryAnalysisPlaybook } from '../packages/shared/dist/agent-prompt-guide.js'
import { DATA_LAYER_MINING_TOOL_NAMES } from '../packages/agent/dist/tool-meta.js'

const INDUSTRY_TOOLS = [
  'list_local_industries',
  'get_industry_stats',
  'get_local_industry_stocks',
  'industry_mining',
  'industry_mermaid',
]

test('ToolRegistry registers industry analysis tools', () => {
  const hub = new ResearchHub()
  const registry = new ToolRegistry(hub)
  const names = registry.list().map(t => t.name)
  for (const name of INDUSTRY_TOOLS) {
    assert.ok(names.includes(name), `missing tool: ${name}`)
  }
  assert.equal(registry.get('screen_local_industry_stocks'), undefined)
})

test('industry tools are chat-visible via CHAT_MCP_TOOL_NAMES', async () => {
  const { CHAT_MCP_TOOL_NAMES } = await import('../packages/agent/dist/unified-mcp-tools.js')
  const hub = new ResearchHub()
  const registry = new ToolRegistry(hub)
  const chatTools = new Set(CHAT_MCP_TOOL_NAMES(registry))
  for (const name of INDUSTRY_TOOLS) {
    assert.ok(chatTools.has(name), `chat tool missing: ${name}`)
  }
})

test('mining whitelist includes industry read tools but not deprecated screen_local_industry_stocks', () => {
  assert.ok(DATA_LAYER_MINING_TOOL_NAMES.includes('list_local_industries'))
  assert.ok(DATA_LAYER_MINING_TOOL_NAMES.includes('get_industry_stats'))
  assert.ok(!DATA_LAYER_MINING_TOOL_NAMES.includes('screen_local_industry_stocks'))
})

test('agent prompt includes industry analysis playbook', () => {
  const text = buildIndustryAnalysisPlaybook()
  assert.match(text, /list_local_industries/)
  assert.match(text, /screen_stocks/)
  assert.match(text, /get_local_data_status/)
})
