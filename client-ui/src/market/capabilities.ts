/** Mirrors @opptrix/shared/instrument-capabilities — UI capability gates */

import type { InstrumentRef } from '../types/instrument'
import type { ApplicationCapability, InstrumentCapabilitySet } from '../types/instrument'

const CN_EQUITY: ApplicationCapability[] = [
  'quote', 'batch_quote', 'snapshot', 'chart_intraday', 'chart_daily',
  'scorecard', 'factor_screen', 'strategy_signal', 'institution_rating',
  'cyq', 'money_flow', 'industry_context', 'discover_mine', 'portfolio_pnl', 'prep_hydrate',
]

const CN_INDEX: ApplicationCapability[] = [
  'quote', 'batch_quote', 'snapshot', 'chart_intraday', 'chart_daily', 'discover_mine',
]

const CN_ETF: ApplicationCapability[] = [
  'quote', 'batch_quote', 'snapshot', 'chart_daily', 'scorecard', 'discover_mine',
]

const US_EQUITY: ApplicationCapability[] = [
  'quote', 'batch_quote', 'snapshot', 'chart_intraday', 'chart_daily', 'discover_mine', 'portfolio_pnl',
]

const CRYPTO_SPOT: ApplicationCapability[] = [
  'quote', 'batch_quote', 'snapshot', 'chart_daily', 'discover_mine',
]

const HK_EQUITY: ApplicationCapability[] = [
  'quote', 'batch_quote', 'snapshot', 'chart_intraday', 'chart_daily', 'discover_mine', 'portfolio_pnl',
]

const JP_EQUITY: ApplicationCapability[] = ['quote', 'snapshot', 'chart_daily', 'discover_mine']
const KR_EQUITY: ApplicationCapability[] = ['quote', 'snapshot', 'chart_daily', 'discover_mine']

const MATRIX: InstrumentCapabilitySet[] = [
  { market: 'CN', assetClass: 'EQUITY', capabilities: CN_EQUITY, detailPanelKind: 'cn-equity' },
  { market: 'CN', assetClass: 'INDEX', capabilities: CN_INDEX, detailPanelKind: 'cn-equity' },
  { market: 'CN', assetClass: 'ETF', capabilities: CN_ETF, detailPanelKind: 'cn-etf' },
  { market: 'US', assetClass: 'EQUITY', capabilities: US_EQUITY, detailPanelKind: 'cross-market' },
  { market: 'HK', assetClass: 'EQUITY', capabilities: HK_EQUITY, detailPanelKind: 'cross-market' },
  { market: 'JP', assetClass: 'EQUITY', capabilities: JP_EQUITY, detailPanelKind: 'cross-market' },
  { market: 'KR', assetClass: 'EQUITY', capabilities: KR_EQUITY, detailPanelKind: 'cross-market' },
  { market: 'CRYPTO', assetClass: 'CRYPTO_SPOT', capabilities: CRYPTO_SPOT, detailPanelKind: 'cross-market' },
]

export function resolveInstrumentCapabilities(ref: InstrumentRef): InstrumentCapabilitySet {
  const hit = MATRIX.find(row => row.market === ref.market && row.assetClass === ref.assetClass)
  if (hit) return hit
  if (ref.market === 'CN') {
    return { market: 'CN', assetClass: 'EQUITY', capabilities: CN_EQUITY, detailPanelKind: 'cn-equity' }
  }
  if (ref.market === 'US') {
    return { market: 'US', assetClass: 'EQUITY', capabilities: US_EQUITY, detailPanelKind: 'cross-market' }
  }
  if (ref.market === 'HK') {
    return { market: 'HK', assetClass: 'EQUITY', capabilities: HK_EQUITY, detailPanelKind: 'cross-market' }
  }
  if (ref.market === 'JP') {
    return { market: 'JP', assetClass: 'EQUITY', capabilities: JP_EQUITY, detailPanelKind: 'cross-market' }
  }
  if (ref.market === 'KR') {
    return { market: 'KR', assetClass: 'EQUITY', capabilities: KR_EQUITY, detailPanelKind: 'cross-market' }
  }
  if (ref.market === 'CRYPTO') {
    return { market: 'CRYPTO', assetClass: 'CRYPTO_SPOT', capabilities: CRYPTO_SPOT, detailPanelKind: 'cross-market' }
  }
  return { market: ref.market, assetClass: ref.assetClass, capabilities: [], detailPanelKind: 'unsupported' }
}

export function hasApplicationCapability(ref: InstrumentRef, cap: ApplicationCapability): boolean {
  return resolveInstrumentCapabilities(ref).capabilities.includes(cap)
}
