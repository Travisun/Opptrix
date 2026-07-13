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

const CN_EQUITY_ONLINE_TOOLS = [
  'get_market_regime',
  'get_local_universe_screen_schema',
  'screen_stocks',
  'screen_local_universe',
  'screen_local_industry_stocks',
  'search_local_instruments',
  'search_instruments',
  'batch_instrument_snapshots',
  'institution_rating',
  ...UNIFIED_INSTRUMENT_MINING_TOOLS,
  'verify_instrument_strategy',
  'get_instrument_cyq',
  'get_instrument_latest_evaluation',
  'list_local_industries',
  'get_industry_stats',
  'get_local_industry_stocks',
] as const

const REGIONAL_MINING_TOOLS = [
  'search_instruments',
  ...UNIFIED_INSTRUMENT_MINING_TOOLS,
] as const

/** Agent 挖掘工具组 — 与 packages/agent tool-meta 对齐 */
export const DISCOVER_MINING_TOOL_GROUPS = {
  cn_equity_full: [...CN_EQUITY_ONLINE_TOOLS],
  cn_etf: [
    'search_etfs',
    'get_etf_list',
    'get_etf_snapshot',
    'get_etf_nav',
    'get_etf_holdings',
    'get_etf_scorecard',
    'search_instruments',
    'get_instrument_snapshot',
    'evaluate_instrument',
    'get_instrument_strategy_signal',
  ],
  us_equity: [
    'screen_us_universe',
    'search_instruments',
    ...UNIFIED_INSTRUMENT_MINING_TOOLS,
  ],
  crypto_spot: [
    'screen_crypto_universe',
    'search_instruments',
    ...UNIFIED_INSTRUMENT_MINING_TOOLS,
  ],
  jp_equity: [] as const,
  kr_equity: [] as const,
  hk_equity: [
    'screen_hk_universe',
    ...REGIONAL_MINING_TOOLS,
  ],
  none: [] as const,
} as const satisfies Record<string, readonly string[]>

export function discoverMiningToolNamesForProfile(
  profile: DiscoverStrategyProfile,
): readonly string[] {
  const group = getDiscoverProfileDefinition(profile)?.miningToolGroup ?? 'none'
  return DISCOVER_MINING_TOOL_GROUPS[group] ?? DISCOVER_MINING_TOOL_GROUPS.none
}
