import test from 'node:test'
import assert from 'node:assert/strict'
import { ToolRegistry } from '../packages/agent/dist/tools.js'
import { ResearchHub } from '../packages/research-hub/dist/hub.js'
import { DATA_LAYER_MINING_TOOL_NAMES } from '../packages/agent/dist/tool-meta.js'
import { buildMarketContextPlaybook } from '../packages/shared/dist/agent-prompt-guide.js'

const P0_TOOLS = [
  'get_watchlist_radar',
  'get_market_regime',
  'get_market_dynamics',
  'get_trend_brief',
]

const P1_TOOLS = [
  'get_etf_list',
  'get_etf_scorecard',
  'screen_us_universe',
  'screen_hk_universe',
  'screen_crypto_universe',
]

const REMOVED_LEGACY = [
  'evaluate_stock',
  'search_stocks',
  'search_us_stocks',
  'search_crypto_pairs',
  'get_strategy_signal',
  'strategy_verify',
  'strategy_verify_report',
  'get_latest_evaluation',
  'local_screen_stocks',
  'trigger_market_db_sync',
  'get_market_db_status',
  'get_local_universe_screen_schema',
  'screen_local_universe',
  'screen_local_industry_stocks',
  'search_local_instruments',
  'screen_stocks',
  'get_local_data_status',
  'list_local_industries',
  'get_industry_stats',
  'get_local_industry_stocks',
]

test('ToolRegistry registers P0/P1 market and screening tools', () => {
  const registry = new ToolRegistry(new ResearchHub())
  const names = new Set(registry.list().map(t => t.name))
  for (const name of [...P0_TOOLS, ...P1_TOOLS]) {
    assert.ok(names.has(name), `missing tool: ${name}`)
  }
  for (const name of REMOVED_LEGACY) {
    assert.ok(!names.has(name), `legacy tool should be removed: ${name}`)
  }
})

test('P0 tools are mining-eligible where appropriate', () => {
  for (const name of P0_TOOLS) {
    assert.ok(DATA_LAYER_MINING_TOOL_NAMES.includes(name), `${name} should be mining eligible`)
  }
  assert.ok(!DATA_LAYER_MINING_TOOL_NAMES.includes('get_local_data_status'))
  assert.ok(!DATA_LAYER_MINING_TOOL_NAMES.includes('screen_stocks'))
})

test('market_db_status hub reports local screening disabled', async () => {
  const hub = new ResearchHub()
  const resp = await hub.dispatch('market_db_status', {})
  assert.equal(resp.success, true)
  const data = resp.data
  assert.ok(data && typeof data === 'object')
  assert.equal(data.local_offline_screening_enabled, false)
  assert.equal(data.local_factor_ready, false)
  assert.ok(typeof data.guidance === 'string')
  assert.match(String(data.guidance), /停用|已移除|在线/)
})

test('agent prompt includes market context playbook', () => {
  const text = buildMarketContextPlaybook()
  assert.match(text, /get_market_regime/)
  assert.match(text, /get_watchlist_radar/)
  assert.match(text, /screen_us_universe/)
})
