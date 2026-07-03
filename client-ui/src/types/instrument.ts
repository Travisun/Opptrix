/** Mirrors @opptrix/shared/market-data — kept local to avoid bundling workspace packages in Vite. */

export type Market = 'CN' | 'US' | 'HK' | 'CRYPTO'

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

export type DetailPanelKind = 'cn-equity' | 'cn-etf' | 'us' | 'crypto' | 'other'

export interface LocalInstrumentHit {
  code: string
  name: string | null
  market: Market
  assetClass: AssetClass
  exchange: string | null
  instrument: InstrumentRef
  refLabel: string
}
