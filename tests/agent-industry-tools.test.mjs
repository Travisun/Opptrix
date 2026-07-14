import test from 'node:test'
import assert from 'node:assert/strict'
import { ToolRegistry } from '../packages/agent/dist/tools.js'
import { ResearchHub } from '../packages/research-hub/dist/hub.js'
import { buildIndustryAnalysisPlaybook } from '../packages/shared/dist/agent-prompt-guide.js'
import { DATA_LAYER_MINING_TOOL_NAMES } from '../packages/agent/dist/tool-meta.js'

const INDUSTRY_TOOLS = [
  'industry_mining',
  'industry_mermaid',
]

const REMOVED_LOCAL_INDUSTRY_TOOLS = [
  'list_local_industries',
  'get_industry_stats',
  'get_local_industry_stocks',
  'screen_local_industry_stocks',
  'screen_local_universe',
  'get_local_universe_screen_schema',
  'screen_stocks',
  'search_local_instruments',
  'get_local_data_status',
]

test('ToolRegistry registers industry_mining tools without local industry tools', () => {
  const hub = new ResearchHub()
  const registry = new ToolRegistry(hub)
  const names = registry.list().map(t => t.name)
  for (const name of INDUSTRY_TOOLS) {
    assert.ok(names.includes(name), `missing tool: ${name}`)
  }
  for (const name of REMOVED_LOCAL_INDUSTRY_TOOLS) {
    assert.equal(registry.get(name), undefined, `tool should be removed: ${name}`)
  }
})

test('industry tools are chat-visible via CHAT_MCP_TOOL_NAMES', async () => {
  const { CHAT_MCP_TOOL_NAMES } = await import('../packages/agent/dist/unified-mcp-tools.js')
  const hub = new ResearchHub()
  const registry = new ToolRegistry(hub)
  const chatTools = new Set(CHAT_MCP_TOOL_NAMES(registry))
  for (const name of INDUSTRY_TOOLS) {
    assert.ok(chatTools.has(name), `chat tool missing: ${name}`)
  }
  for (const name of REMOVED_LOCAL_INDUSTRY_TOOLS) {
    assert.ok(!chatTools.has(name), `chat tool should be removed: ${name}`)
  }
})

test('mining whitelist keeps industry_mining and drops local industry/factor tools', () => {
  assert.ok(DATA_LAYER_MINING_TOOL_NAMES.includes('industry_mining'))
  assert.ok(DATA_LAYER_MINING_TOOL_NAMES.includes('industry_mermaid'))
  for (const name of REMOVED_LOCAL_INDUSTRY_TOOLS) {
    assert.ok(!DATA_LAYER_MINING_TOOL_NAMES.includes(name), `should not be mining eligible: ${name}`)
  }
})

test('agent prompt includes industry analysis playbook without local tools', () => {
  const text = buildIndustryAnalysisPlaybook()
  assert.match(text, /industry_mining/)
  assert.match(text, /industry_mermaid/)
  assert.match(text, /不依赖本地行业库/)
  assert.doesNotMatch(text, /list_local_industries/)
  assert.doesNotMatch(text, /screen_local_universe/)
  assert.doesNotMatch(text, /get_local_data_status/)
  assert.doesNotMatch(text, /screen_stocks/)
})
