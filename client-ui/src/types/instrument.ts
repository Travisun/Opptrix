/** Mirrors @opptrix/shared/market-data — kept local to avoid bundling workspace packages in Vite. */

export type Market = 'CN' | 'US' | 'HK' | 'CRYPTO' | 'JP' | 'KR'

export type AssetClass =
  | 'EQUITY'
  | 'ETF'
  | 'INDEX'
  | 'FUND'
  | 'CRYPTO_SPOT'
  | 'CRYPTO_PERP'

export interface InstrumentRef {
  market: Market
  assetClass: AssetClass
  symbol: string
  exchange?: string
  quote?: string
}

export type DetailPanelKind = 'cn-equity' | 'cn-etf' | 'crypto' | 'cross-market'

export interface LocalInstrumentHit {
  code: string
  name: string | null
  market: Market
  assetClass: AssetClass
  exchange: string | null
  instrument: InstrumentRef
  refLabel: string
}

/** Mirrors @opptrix/shared instrument-capabilities */
export type ApplicationCapability =
  | 'quote'
  | 'batch_quote'
  | 'snapshot'
  | 'chart_intraday'
  | 'chart_daily'
  | 'scorecard'
  | 'factor_screen'
  | 'strategy_signal'
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

export interface UnifiedInstrumentQuote {
  instrument: InstrumentRef
  code: string
  name: string
  price: number | null
  change_pct: number | null
  volume: number | null
  amount: number | null
  market: Market
  asset_class: AssetClass
  source: 'local' | 'live' | 'mixed'
  open?: number | null
  high?: number | null
  low?: number | null
  pre_close?: number | null
  change?: number | null
  pe?: number | null
  pb?: number | null
  turnover_rate?: number | null
  amplitude?: number | null
  volume_ratio?: number | null
  market_cap?: number | null
}
