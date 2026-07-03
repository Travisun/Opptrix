/** Local market data pack scope — user toggles optional packs in settings. */

export type MarketDataPackId = 'cn' | 'us' | 'crypto'

export interface MarketDataPackEntry {
  enabled: boolean
  /** ISO timestamp when pack was last prepared (sync completed) */
  prepared_at?: string | null
}

export interface MarketDataPackConfig {
  cn: MarketDataPackEntry
  us: MarketDataPackEntry
  crypto: MarketDataPackEntry
}

export const MARKET_DATA_PACK_PREF_KEY = 'market_data_packs'

export const DEFAULT_MARKET_DATA_PACK_CONFIG: MarketDataPackConfig = {
  cn: { enabled: true },
  us: { enabled: false },
  crypto: { enabled: false },
}

export const MARKET_PACK_LABELS: Record<MarketDataPackId, string> = {
  cn: 'A 股',
  us: '美股',
  crypto: 'Crypto',
}

export const MARKET_PACK_DESCRIPTIONS: Record<MarketDataPackId, string> = {
  cn: '默认开启：股票池、行情、因子与 ETF 等本地挖掘数据',
  us: '开启后同步美股列表与本地行情截面（需 Polygon 或 Yahoo 回退）',
  crypto: '开启后同步 Crypto 交易对列表（公开 API，无需密钥）',
}
