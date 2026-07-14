import type { ApplicationCapability } from './instrument-capabilities.js'

/**
 * 编排层标准 Hub capability — 上层 / Agent 应优先使用此枚举对应的 feature。
 * legacy feature（stock_* / us_*）在 Hub 内 shim 到此表。
 */
export type InstrumentHubCapability =
  | 'snapshot'
  | 'quotes'
  | 'chart'
  | 'chart_intraday'
  | 'capabilities'
  | 'search'
  | 'profile'
  | 'financials'
  | 'balance_sheet'
  | 'cash_flow'
  | 'shareholders'
  | 'dividend'
  | 'money_flow'
  | 'notices'
  | 'sector_list'
  | 'sector_constituents'
  | 'etf_profile'
  | 'cyq'
  | 'institution_rating'
  | 'institution_report'
  | 'evaluation'
  | 'strategy_signal'
  | 'indicators'
  | 'strategy_verify'
  | 'batch_snapshots'

export const INSTRUMENT_HUB_FEATURE: Record<InstrumentHubCapability, string> = {
  snapshot: 'instrument_snapshot',
  quotes: 'instrument_quotes',
  chart: 'instrument_chart',
  chart_intraday: 'instrument_chart',
  capabilities: 'instrument_capabilities',
  search: 'instrument_search',
  profile: 'instrument_profile',
  financials: 'instrument_financials',
  balance_sheet: 'instrument_balance_sheet',
  cash_flow: 'instrument_cash_flow',
  shareholders: 'instrument_shareholders',
  dividend: 'instrument_dividend',
  money_flow: 'instrument_money_flow',
  notices: 'instrument_notices',
  sector_list: 'sector_list',
  sector_constituents: 'sector_constituents',
  etf_profile: 'etf_profile',
  cyq: 'instrument_cyq',
  institution_rating: 'instrument_institution_rating',
  institution_report: 'instrument_institution_report',
  evaluation: 'instrument_evaluation',
  strategy_signal: 'instrument_strategy_signal',
  indicators: 'instrument_indicators',
  strategy_verify: 'instrument_strategy_verify',
  batch_snapshots: 'instrument_batch_snapshots',
}

/** legacy feature → 标准 instrument feature（未映射的保持原名，由 Hub 自行处理） */
export const LEGACY_HUB_FEATURE_SHIM: Record<string, InstrumentHubCapability> = {
  stock_detail: 'snapshot',
  stock_quotes: 'quotes',
  stock_chart: 'chart',
  stock_kline: 'chart',
  stock_cyq: 'cyq',
  us_snapshot: 'snapshot',
  us_realtime: 'quotes',
  us_kline: 'chart',
  crypto_snapshot: 'snapshot',
  crypto_realtime: 'quotes',
  crypto_kline: 'chart',
  batch_stock_snapshots: 'batch_snapshots',
  stock_diagnosis: 'evaluation',
  latest_evaluation: 'evaluation',
  strategy_signal: 'strategy_signal',
  strategy_verify: 'strategy_verify',
  institution_rating: 'institution_rating',
  institution_report: 'institution_report',
  search_stocks: 'search',
  etf_snapshot: 'snapshot',
  us_profile: 'profile',
  us_financials: 'financials',
}

export function resolveInstrumentHubFeature(legacyOrStandard: string): string {
  const cap = LEGACY_HUB_FEATURE_SHIM[legacyOrStandard]
  return cap ? INSTRUMENT_HUB_FEATURE[cap] : legacyOrStandard
}

export function hubCapabilityForApplication(cap: ApplicationCapability): InstrumentHubCapability | null {
  switch (cap) {
    case 'snapshot': return 'snapshot'
    case 'quote': return 'quotes'
    case 'batch_quote': return 'quotes'
    case 'chart_daily': return 'chart'
    case 'chart_intraday': return 'chart_intraday'
    case 'cyq': return 'cyq'
    case 'money_flow': return 'money_flow'
    case 'institution_rating': return 'institution_rating'
    case 'scorecard': return 'evaluation'
    case 'strategy_signal': return 'strategy_signal'
    case 'technical_indicators': return 'indicators'
    default: return null
  }
}
