/**
 * 应用层标准 Hub Feature 名称 — 横向扩展时优先新增/调用此表中的 feature，
 * 市场特化 feature（stock_* / us_*）作为 adapter 实现细节保留。
 */
export const APPLICATION_HUB_FEATURES = {
  /** InstrumentRef 统一入口 */
  instrumentSnapshot: 'instrument_snapshot',
  instrumentQuotes: 'instrument_quotes',
  instrumentChart: 'instrument_chart',
  instrumentSearch: 'instrument_search',
  instrumentCapabilities: 'instrument_capabilities',
  instrumentCyq: 'instrument_cyq',
  instrumentInstitutionRating: 'instrument_institution_rating',
  instrumentInstitutionReport: 'instrument_institution_report',
  instrumentBatchSnapshots: 'instrument_batch_snapshots',

  /** 发现 / 策略 */
  discoverProfiles: 'discover_profiles',
  discoverReadiness: 'discover_profile_readiness',
  discoverScorecards: 'discover_scorecards',
  marketRegime: 'market_regime',

  /** 本地库 / 数据包 */
  marketDbStatus: 'market_db_status',
  marketDataPacks: 'market_data_packs',
  searchLocalInstruments: 'search_local_instruments',
} as const

export type ApplicationHubFeature =
  (typeof APPLICATION_HUB_FEATURES)[keyof typeof APPLICATION_HUB_FEATURES]

/** 统一行情条目 — watchlist / 搜索 / 聊天引用 */
export interface UnifiedInstrumentQuote {
  instrument: import('./market-data.js').InstrumentRef
  code: string
  name: string
  price: number | null
  change_pct: number | null
  volume: number | null
  amount: number | null
  market: import('./market-data.js').Market
  asset_class: import('./market-data.js').AssetClass
  source: 'local' | 'live' | 'mixed'
}

/** instrument_search 请求 */
export interface InstrumentSearchParams {
  keyword: string
  limit?: number
  markets?: import('./market-data.js').Market[]
  asset_classes?: import('./market-data.js').AssetClass[]
}

/** instrument_chart 请求 */
export interface InstrumentChartParams {
  instrument: import('./market-data.js').InstrumentRef
  period?: 'daily' | 'weekly' | 'monthly' | 'intraday'
  count?: number
}
