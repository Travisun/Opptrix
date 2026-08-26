import type { AssetClass, InstrumentRef, Market } from './market-data.js'

/**
 * 应用层能力 — 右侧面板 / 聊天 / 搜索 / 关注列表 消费的能力矩阵。
 * 与 data-layer Capability（Provider 路由）不同，这是产品功能开关。
 */
export type ApplicationCapability =
  | 'quote'
  | 'batch_quote'
  | 'snapshot'
  | 'chart_intraday'
  | 'chart_daily'
  | 'scorecard'
  | 'factor_screen'
  | 'strategy_signal'
  | 'technical_indicators'
  | 'institution_rating'
  | 'cyq'
  | 'money_flow'
  | 'industry_context'
  | 'discover_mine'
  | 'portfolio_pnl'
  | 'prep_hydrate'

export interface InstrumentCapabilitySet {
  market: Market
  assetClass: AssetClass
  capabilities: readonly ApplicationCapability[]
  detailPanelKind: 'cn-equity' | 'cn-etf' | 'cn-fund' | 'cross-market' | 'unsupported'
}

const CN_EQUITY: ApplicationCapability[] = [
  'quote', 'batch_quote', 'snapshot', 'chart_intraday', 'chart_daily',
  'scorecard', 'strategy_signal', 'institution_rating',
  'cyq', 'money_flow', 'industry_context', 'portfolio_pnl', 'prep_hydrate',
]

const CN_INDEX: ApplicationCapability[] = [
  'quote', 'batch_quote', 'snapshot', 'chart_intraday', 'chart_daily', 'discover_mine',
]

const CN_ETF: ApplicationCapability[] = [
  'quote', 'batch_quote', 'snapshot', 'chart_daily', 'scorecard', 'discover_mine', 'portfolio_pnl',
]

const CN_FUND: ApplicationCapability[] = [
  'quote', 'batch_quote', 'snapshot', 'chart_daily', 'discover_mine', 'portfolio_pnl',
]

const US_EQUITY: ApplicationCapability[] = [
  'quote', 'batch_quote', 'snapshot', 'chart_daily', 'strategy_signal',
  'technical_indicators', 'discover_mine', 'portfolio_pnl',
]

const CRYPTO_SPOT: ApplicationCapability[] = [
  'quote', 'batch_quote', 'snapshot', 'chart_daily', 'strategy_signal',
  'technical_indicators', 'discover_mine',
]

const HK_EQUITY: ApplicationCapability[] = [
  'quote', 'batch_quote', 'snapshot', 'chart_daily', 'strategy_signal',
  'technical_indicators', 'discover_mine', 'portfolio_pnl',
]

const US_ETF: ApplicationCapability[] = [...US_EQUITY]
const HK_ETF: ApplicationCapability[] = [...HK_EQUITY]

const JP_EQUITY: ApplicationCapability[] = [
  'quote', 'snapshot', 'chart_daily', 'discover_mine',
]

const KR_EQUITY: ApplicationCapability[] = [
  'quote', 'snapshot', 'chart_daily', 'discover_mine',
]

const CRYPTO_PERP: ApplicationCapability[] = [...CRYPTO_SPOT]

function capabilityRow(
  market: Market,
  assetClass: AssetClass,
  capabilities: ApplicationCapability[],
  detailPanelKind: InstrumentCapabilitySet['detailPanelKind'],
): InstrumentCapabilitySet {
  return { market, assetClass, capabilities, detailPanelKind }
}

/** 静态能力矩阵 — 新市场在此登记一行即可驱动 UI gate */
export const INSTRUMENT_CAPABILITY_MATRIX: InstrumentCapabilitySet[] = [
  capabilityRow('CN', 'EQUITY', CN_EQUITY, 'cn-equity'),
  capabilityRow('CN', 'INDEX', CN_INDEX, 'cn-equity'),
  capabilityRow('CN', 'ETF', CN_ETF, 'cn-etf'),
  capabilityRow('CN', 'LOF', CN_ETF, 'cn-etf'),
  capabilityRow('CN', 'REIT', CN_FUND, 'cn-fund'),
  capabilityRow('CN', 'FUND', CN_FUND, 'cn-fund'),
  capabilityRow('US', 'EQUITY', US_EQUITY, 'cross-market'),
  capabilityRow('US', 'ETF', US_ETF, 'cross-market'),
  capabilityRow('HK', 'EQUITY', HK_EQUITY, 'cross-market'),
  capabilityRow('HK', 'ETF', HK_ETF, 'cross-market'),
  capabilityRow('JP', 'EQUITY', JP_EQUITY, 'cross-market'),
  capabilityRow('KR', 'EQUITY', KR_EQUITY, 'cross-market'),
  capabilityRow('CRYPTO', 'CRYPTO_SPOT', CRYPTO_SPOT, 'cross-market'),
  capabilityRow('CRYPTO', 'CRYPTO_PERP', CRYPTO_PERP, 'cross-market'),
]

export function resolveInstrumentCapabilities(ref: InstrumentRef): InstrumentCapabilitySet {
  const hit = INSTRUMENT_CAPABILITY_MATRIX.find(
    row => row.market === ref.market && row.assetClass === ref.assetClass,
  )
  if (hit) return hit
  if (ref.market === 'CN') {
    return capabilityRow('CN', 'EQUITY', CN_EQUITY, 'cn-equity')
  }
  if (ref.market === 'JP') {
    return capabilityRow('JP', 'EQUITY', JP_EQUITY, 'cross-market')
  }
  if (ref.market === 'KR') {
    return capabilityRow('KR', 'EQUITY', KR_EQUITY, 'cross-market')
  }
  if (ref.market === 'US') {
    if (ref.assetClass === 'ETF') {
      return capabilityRow('US', 'ETF', US_ETF, 'cross-market')
    }
    return capabilityRow('US', 'EQUITY', US_EQUITY, 'cross-market')
  }
  if (ref.market === 'HK') {
    if (ref.assetClass === 'ETF') {
      return capabilityRow('HK', 'ETF', HK_ETF, 'cross-market')
    }
    return capabilityRow('HK', 'EQUITY', HK_EQUITY, 'cross-market')
  }
  if (ref.market === 'CRYPTO') {
    if (ref.assetClass === 'CRYPTO_PERP') {
      return capabilityRow('CRYPTO', 'CRYPTO_PERP', CRYPTO_PERP, 'cross-market')
    }
    return capabilityRow('CRYPTO', 'CRYPTO_SPOT', CRYPTO_SPOT, 'cross-market')
  }
  return capabilityRow(ref.market, ref.assetClass, [], 'unsupported')
}

export function hasApplicationCapability(
  ref: InstrumentRef,
  cap: ApplicationCapability,
): boolean {
  return resolveInstrumentCapabilities(ref).capabilities.includes(cap)
}
