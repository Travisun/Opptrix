/** Multi-market instrument identifiers — DATA-LAYER §4 */

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
  /** Market-local symbol: A-share 6-digit, US ticker, crypto base */
  symbol: string
  exchange?: string
  quote?: string
}

export type MarketGroup = Market | 'GLOBAL'
