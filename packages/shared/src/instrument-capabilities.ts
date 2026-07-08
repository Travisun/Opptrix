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
  detailPanelKind: 'cn-equity' | 'cn-etf' | 'cross-market' | 'unsupported'
}

const CN_EQUITY: ApplicationCapability[] = [
  'quote', 'batch_quote', 'snapshot', 'chart_intraday', 'chart_daily',
  'scorecard', 'factor_screen', 'strategy_signal', 'institution_rating',
  'cyq', 'money_flow', 'industry_context', 'discover_mine', 'portfolio_pnl', 'prep_hydrate',
]

const CN_ETF: ApplicationCapability[] = [
  'quote', 'batch_quote', 'snapshot', 'chart_daily', 'scorecard', 'discover_mine',
]

const US_EQUITY: ApplicationCapability[] = [
  'quote', 'batch_quote', 'snapshot', 'chart_daily', 'strategy_signal',
  'technical_indicators', 'discover_mine',
]

const CRYPTO_SPOT: ApplicationCapability[] = [
  'quote', 'batch_quote', 'snapshot', 'chart_daily', 'strategy_signal',
  'technical_indicators', 'discover_mine',
]

const HK_EQUITY: ApplicationCapability[] = [
  'quote', 'batch_quote', 'snapshot', 'chart_daily', 'strategy_signal',
  'technical_indicators', 'discover_mine',
]

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
  capabilityRow('CN', 'ETF', CN_ETF, 'cn-etf'),
  capabilityRow('US', 'EQUITY', US_EQUITY, 'cross-market'),
  capabilityRow('HK', 'EQUITY', HK_EQUITY, 'cross-market'),
  capabilityRow('CRYPTO', 'CRYPTO_SPOT', CRYPTO_SPOT, 'cross-market'),
]

export function resolveInstrumentCapabilities(ref: InstrumentRef): InstrumentCapabilitySet {
  const hit = INSTRUMENT_CAPABILITY_MATRIX.find(
    row => row.market === ref.market && row.assetClass === ref.assetClass,
  )
  if (hit) return hit
  if (ref.market === 'CN') {
    return capabilityRow('CN', 'EQUITY', CN_EQUITY, 'cn-equity')
  }
  if (ref.market === 'JP' || ref.market === 'KR') {
    return capabilityRow(ref.market, 'EQUITY', [], 'unsupported')
  }
  if (ref.market === 'US' || ref.market === 'HK') {
    const caps = ref.market === 'HK' ? HK_EQUITY : US_EQUITY
    return capabilityRow(ref.market, 'EQUITY', caps, 'cross-market')
  }
  if (ref.market === 'CRYPTO') {
    return capabilityRow('CRYPTO', 'CRYPTO_SPOT', CRYPTO_SPOT, 'cross-market')
  }
  return capabilityRow('CN', 'EQUITY', [], 'unsupported')
}

export function hasApplicationCapability(
  ref: InstrumentRef,
  cap: ApplicationCapability,
): boolean {
  return resolveInstrumentCapabilities(ref).capabilities.includes(cap)
}
