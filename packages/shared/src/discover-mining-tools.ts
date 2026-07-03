import type { DiscoverStrategyProfile } from './discover-profile-types.js'
import { getDiscoverProfileDefinition } from './discover-profile-registry.js'

/** Agent 挖掘工具组 — 与 packages/agent tool-meta 对齐 */
export const DISCOVER_MINING_TOOL_GROUPS = {
  cn_equity_full: [
    'get_market_db_status',
    'get_market_db_sync_state',
    'trigger_market_db_sync',
    'get_local_universe_screen_schema',
    'screen_local_universe',
    'list_local_industries',
    'screen_local_industry_stocks',
    'batch_stock_snapshots',
    'search_stocks',
    'evaluate_stock',
    'get_latest_evaluation',
    'get_strategy_signal',
    'institution_rating',
    'get_stock_detail',
    'get_stock_chart',
    'get_stock_cyq',
    'screen_local_etfs',
    'get_etf_scorecard',
  ],
  cn_etf: [
    'get_market_db_status',
    'get_local_etf_screen_schema',
    'screen_local_etfs',
    'get_etf_scorecard',
    'get_etf_snapshot',
    'get_etf_nav',
    'get_etf_holdings',
  ],
  us_equity: [
    'get_market_db_status',
    'get_local_us_screen_schema',
    'screen_local_us_stocks',
    'search_us_stocks',
    'get_us_stock_snapshot',
    'get_us_stock_profile',
    'get_us_stock_financials',
    'get_us_stock_kline',
    'get_us_stock_quote',
  ],
  crypto_spot: [
    'get_market_db_status',
    'get_local_crypto_screen_schema',
    'screen_local_crypto_pairs',
    'search_crypto_pairs',
    'get_crypto_snapshot',
    'get_crypto_kline',
    'get_crypto_quote',
  ],
  jp_equity: [
    'get_market_db_status',
    'get_local_jp_screen_schema',
    'screen_local_jp_stocks',
    'search_us_stocks',
    'get_us_stock_snapshot',
  ],
  kr_equity: [
    'get_market_db_status',
    'get_local_kr_screen_schema',
    'screen_local_kr_stocks',
    'search_us_stocks',
    'get_us_stock_snapshot',
  ],
} as const satisfies Record<string, readonly string[]>

export type DiscoverMiningToolGroupName = keyof typeof DISCOVER_MINING_TOOL_GROUPS

export function discoverMiningToolNamesForProfile(profile: DiscoverStrategyProfile): readonly string[] {
  const def = getDiscoverProfileDefinition(profile)
  if (!def || def.miningToolGroup === 'none') {
    return DISCOVER_MINING_TOOL_GROUPS.cn_equity_full
  }
  const group = def.miningToolGroup as DiscoverMiningToolGroupName
  return DISCOVER_MINING_TOOL_GROUPS[group] ?? DISCOVER_MINING_TOOL_GROUPS.cn_equity_full
}
