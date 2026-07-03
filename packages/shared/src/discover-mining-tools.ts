import type { DiscoverStrategyProfile } from './discover-profile-types.js'
import { getDiscoverProfileDefinition } from './discover-profile-registry.js'

/** 跨市场统一分析工具 — 评估 / 策略信号 / 技术指标 */
export const UNIFIED_INSTRUMENT_ANALYTICS_TOOLS = [
  'evaluate_instrument',
  'get_instrument_strategy_signal',
  'get_instrument_indicators',
] as const

/** 跨市场统一行情 + 分析工具 — 用于 us/crypto/regional 挖掘组 */
export const UNIFIED_INSTRUMENT_MINING_TOOLS = [
  'get_instrument_capabilities',
  'get_instrument_snapshot',
  'get_instrument_quotes',
  'get_instrument_chart',
  ...UNIFIED_INSTRUMENT_ANALYTICS_TOOLS,
] as const

/** A 股挖掘专用统一分析工具（含机构评级、筹码） */
export const UNIFIED_CN_ANALYTICS_TOOLS = [
  ...UNIFIED_INSTRUMENT_ANALYTICS_TOOLS,
  'institution_rating',
  'get_instrument_cyq',
] as const

const CN_EQUITY_SCREEN_TOOLS = [
  'get_market_db_status',
  'get_market_db_sync_state',
  'trigger_market_db_sync',
  'get_local_universe_screen_schema',
  'screen_local_universe',
  'list_local_industries',
  'screen_local_industry_stocks',
  'screen_local_etfs',
  'get_etf_scorecard',
] as const

const REGIONAL_MINING_TOOLS = [
  'get_market_db_status',
  'search_local_instruments',
] as const

function regionalMiningTools(schema: string, screen: string): readonly string[] {
  return [...REGIONAL_MINING_TOOLS, schema, screen, ...UNIFIED_INSTRUMENT_MINING_TOOLS]
}

/** Agent 挖掘工具组 — 与 packages/agent tool-meta 对齐 */
export const DISCOVER_MINING_TOOL_GROUPS = {
  cn_equity_full: [
    ...CN_EQUITY_SCREEN_TOOLS,
    'search_local_instruments',
    'batch_instrument_snapshots',
    'institution_rating',
    ...UNIFIED_INSTRUMENT_MINING_TOOLS,
    'verify_instrument_strategy',
    'get_instrument_cyq',
    'get_instrument_latest_evaluation',
  ],
  cn_etf: [
    'get_market_db_status',
    'get_local_etf_screen_schema',
    'screen_local_etfs',
    'get_etf_scorecard',
    'get_etf_snapshot',
    'get_etf_nav',
    'get_etf_holdings',
    'search_local_instruments',
    'get_instrument_snapshot',
    'evaluate_instrument',
    'get_instrument_strategy_signal',
  ],
  us_equity: [
    'get_market_db_status',
    'get_local_us_screen_schema',
    'screen_local_us_stocks',
    'search_local_instruments',
    ...UNIFIED_INSTRUMENT_MINING_TOOLS,
  ],
  crypto_spot: [
    'get_market_db_status',
    'get_local_crypto_screen_schema',
    'screen_local_crypto_pairs',
    'search_local_instruments',
    ...UNIFIED_INSTRUMENT_MINING_TOOLS,
  ],
  jp_equity: regionalMiningTools(
    'get_local_jp_screen_schema',
    'screen_local_jp_stocks',
  ),
  kr_equity: regionalMiningTools(
    'get_local_kr_screen_schema',
    'screen_local_kr_stocks',
  ),
  hk_equity: regionalMiningTools(
    'get_local_hk_screen_schema',
    'screen_local_hk_stocks',
  ),
} as const satisfies Record<string, readonly string[]>

export type DiscoverMiningToolGroupName = keyof typeof DISCOVER_MINING_TOOL_GROUPS

export function discoverMiningToolNamesForProfile(profile: DiscoverStrategyProfile): readonly string[] {
  const def = getDiscoverProfileDefinition(profile)
  if (!def || def.miningToolGroup === 'none') {
    return []
  }
  const group = def.miningToolGroup as DiscoverMiningToolGroupName
  return DISCOVER_MINING_TOOL_GROUPS[group] ?? []
}
