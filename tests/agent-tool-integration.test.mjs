import test from 'node:test'
import assert from 'node:assert/strict'
import { ToolRegistry } from '../packages/agent/dist/tools.js'
import { ResearchHub } from '../packages/research-hub/dist/hub.js'
import { DATA_LAYER_MINING_TOOL_NAMES } from '../packages/agent/dist/tool-meta.js'
import { buildMarketContextPlaybook } from '../packages/shared/dist/agent-prompt-guide.js'

const P0_TOOLS = [
  'get_watchlist',
  'get_market_regime',
  'get_market_dynamics',
  'get_trend_brief',
  'search_instruments',
]

const P1_TOOLS = [
  'get_etf_list',
  'get_etf_nav',
  'get_etf_holdings',
  'evaluate_instrument',
  'get_instrument_snapshot',
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
  'search_etfs',
  'get_etf_scorecard',
  'get_etf_snapshot',
  'screen_us_universe',
  'screen_hk_universe',
  'screen_crypto_universe',
  'get_watchlist_radar',
  'institution_rating',
  'institution_report',
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
  assert.ok(!DATA_LAYER_MINING_TOOL_NAMES.includes('get_watchlist_radar'))
  assert.ok(!DATA_LAYER_MINING_TOOL_NAMES.includes('get_etf_scorecard'))
})

test('ToolRegistry has no market_db hub tools', () => {
  const hub = new ResearchHub()
  const names = new Set(new ToolRegistry(hub).list().map(t => t.name))
  assert.ok(!names.has('get_market_db_status'))
  assert.ok(!names.has('trigger_market_db_sync'))
})

test('agent prompt includes market context playbook', () => {
  const text = buildMarketContextPlaybook()
  assert.match(text, /get_market_regime/)
  assert.match(text, /get_watchlist/)
  assert.match(text, /search_instruments/)
  assert.doesNotMatch(text, /get_watchlist_radar/)
  assert.doesNotMatch(text, /screen_us_universe/)
})
