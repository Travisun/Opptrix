/**
 * 应用层标准 Hub Feature 名称 — 横向扩展时优先新增/调用此表中的 feature，
 * 市场特化 feature（stock_* / us_*）作为 adapter 实现细节保留。
 *
 * 用途：统一上层调用入口，屏蔽底层市场差异。
 */
export const APPLICATION_HUB_FEATURES = {
  /** InstrumentRef 统一入口：获取标的快照 */
  instrumentSnapshot: 'instrument_snapshot',
  /** InstrumentRef 统一入口：获取标的行情 */
  instrumentQuotes: 'instrument_quotes',
  /** InstrumentRef 统一入口：获取标的 K 线 */
  instrumentChart: 'instrument_chart',
  /** InstrumentRef 统一入口：搜索标的 */
  instrumentSearch: 'instrument_search',
  /** InstrumentRef 统一入口：查询标的可用能力 */
  instrumentCapabilities: 'instrument_capabilities',
  /** InstrumentRef 统一入口：获取筹码分布（仅 A 股） */
  instrumentCyq: 'instrument_cyq',
  /** InstrumentRef 统一入口：获取机构评级（仅 A 股） */
  instrumentInstitutionRating: 'instrument_institution_rating',
  /** InstrumentRef 统一入口：获取机构评级报告（仅 A 股） */
  instrumentInstitutionReport: 'instrument_institution_report',
  /** InstrumentRef 统一入口：批量获取标的快照 */
  instrumentBatchSnapshots: 'instrument_batch_snapshots',

  /** InstrumentRef 统一入口：因子评估 / 决策雷达 */
  instrumentEvaluation: 'instrument_evaluation',
  /** InstrumentRef 统一入口：策略信号 */
  instrumentStrategySignal: 'instrument_strategy_signal',
  /** InstrumentRef 统一入口：技术指标 */
  instrumentIndicators: 'instrument_indicators',
  /** InstrumentRef 统一入口：策略验证 */
  instrumentStrategyVerify: 'instrument_strategy_verify',
  /** InstrumentRef 统一入口：读取缓存评估（latest_evaluation） */
  instrumentLatestEvaluation: 'latest_evaluation',

  /** 本地 L0 初选因子筛选 — 与 instrument_search 互补，保留专用入口 */
  localInstrumentScreen: 'local_universe_screen',
  localInstrumentScreenSchema: 'local_universe_screen_schema',
  listScreenFactors: 'list_screen_factors',

  /** 发现策略列表 */
  discoverProfiles: 'discover_profiles',
  /** 发现策略就绪状态 */
  discoverReadiness: 'discover_profile_readiness',
  /** 发现策略评分卡 */
  discoverScorecards: 'discover_scorecards',
  /** 市场状态判断（牛/熊/震荡） */
  marketRegime: 'market_regime',

  /** 本地数据库状态查询 */
  marketDbStatus: 'market_db_status',
  /** 市场数据包管理 */
  marketDataPacks: 'market_data_packs',
  /** 跨市场本地标的搜索 */
  searchLocalInstruments: 'search_local_instruments',
} as const

/**
 * 应用层 Hub Feature 类型 — APPLICATION_HUB_FEATURES 所有值的联合类型。
 *
 * 用途：类型安全的 feature 名称传递。
 */
export type ApplicationHubFeature =
  (typeof APPLICATION_HUB_FEATURES)[keyof typeof APPLICATION_HUB_FEATURES]

/**
 * 统一行情条目 — 跨市场标的的标准化行情数据。
 *
 * 用途：关注列表、搜索结果、聊天引用中的统一行情展示。
 */
export interface UnifiedInstrumentQuote {
  /** 标的引用（含市场、代码、资产类别） */
  instrument: import('./market-data.js').InstrumentRef
  /** 显示代码（如 "600519"、"AAPL"） */
  code: string
  /** 标的名称（如"贵州茅台"、"Apple Inc."） */
  name: string
  /** 最新价格（元/美元），null 表示无实时数据 */
  price: number | null
  /** 涨跌幅（%），null 表示无数据 */
  change_pct: number | null
  /** 成交量（手），null 表示无数据 */
  volume: number | null
  /** 成交额（元/美元），null 表示无数据 */
  amount: number | null
  /** 所属市场（CN/US/HK 等） */
  market: import('./market-data.js').Market
  /** 资产类别（EQUITY/ETF/INDEX 等） */
  asset_class: import('./market-data.js').AssetClass
  /** 数据来源：local=本地库、live=在线、mixed=混合 */
  source: 'local' | 'live' | 'mixed'
  /** 今开 */
  open?: number | null
  /** 最高 */
  high?: number | null
  /** 最低 */
  low?: number | null
  /** 昨收 */
  pre_close?: number | null
  /** 涨跌额 */
  change?: number | null
  /** 市盈率 */
  pe?: number | null
  /** 市净率 */
  pb?: number | null
  /** 换手率（%） */
  turnover_rate?: number | null
  /** 振幅（%） */
  amplitude?: number | null
  /** 量比 */
  volume_ratio?: number | null
  /** 总市值（元） */
  market_cap?: number | null
  /** 流通市值（元） */
  circulating_market_cap?: number | null
}

/**
 * instrument_search 请求参数 — 跨市场标的搜索。
 *
 * 用途：按关键词搜索标的，支持市场和资产类别过滤。
 */
export interface InstrumentSearchParams {
  /** 搜索关键词（代码或名称，如 "茅台"、"AAPL"） */
  keyword: string
  /** 返回条数上限，默认 30 */
  limit?: number
  /** 市场过滤（如 ["CN"]、["US", "HK"]），不传则搜全部市场 */
  markets?: import('./market-data.js').Market[]
  /** 资产类别过滤（如 ["EQUITY"]），不传则搜全部类型 */
  asset_classes?: import('./market-data.js').AssetClass[]
}

/**
 * instrument_chart 请求参数 — 获取标的历史 K 线数据。
 *
 * 用途：K 线图表渲染、技术分析。
 */
export interface InstrumentChartParams {
  /** 标的引用（含市场、代码） */
  instrument: import('./market-data.js').InstrumentRef
  /** K 线周期，默认 "daily" */
  period?: 'daily' | 'weekly' | 'monthly' | 'intraday'
  /** 返回 K 线根数，默认 120 */
  count?: number
}
