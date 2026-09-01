/* Shared API response types for client-ui */

export interface ScorecardDimension {
  name: string; score: number; weight: number
}
export interface FactorItem {
  name: string; value: number | null; category: string
}
export interface StockDiagnosisData {
  code: string; name: string; total_score: number
  scorecard_name: string
  scorecard_dimensions: ScorecardDimension[]
  factors: FactorItem[]
  valid_factor_count: number; total_factor_count: number
  factor_categories: Record<string, string[]>
  timestamp?: string
}

export interface InstitutionRatingItem {
  institution: string; institution_short: string
  rating: string; rating_cn: string
  confidence: number; raw_confidence: number
  method_source: string; model_name: string
  summary: string; group: string
  dimensions?: { name: string; score: number; weight: number; detail: string }[] | null
}
export interface InstitutionRatingData {
  code: string; name: string
  avg_confidence: number; avg_raw_confidence: number
  consensus_rating: string; consensus_rating_cn: string
  confidence_std: number; agreement_rate: number
  rating_distribution: Record<string, number>
  bullish_count: number; bearish_count: number; neutral_count: number
  group_stats: Record<string, { avg: number; count: number; buy: number; sell: number }>
  ratings: InstitutionRatingItem[]
  avg_data_quality: number; timestamp?: string
}

export type DiscoverStrategyCategory = 'value' | 'growth' | 'quality' | 'momentum' | 'balanced' | 'contrarian'

export type DiscoverStrategyProfile =
  | 'cn_equity'
  | 'cn_etf'
  | 'us_equity'
  | 'crypto_spot'
  | 'jp_equity'
  | 'kr_equity'
  | 'hk_equity'

export type DiscoverStrategySource = 'builtin' | 'custom'

export interface DiscoverProfileMeta {
  id: DiscoverStrategyProfile
  label: string
  description: string
  requires_pack: 'cn' | 'us' | 'crypto' | 'hk' | 'jp' | 'kr' | null
  factor_count: number
  mining_ready: boolean
}

export type DiscoverReadinessMode = 'local' | 'online' | 'blocked'

export interface DiscoverProfileReadiness {
  profile: DiscoverStrategyProfile
  ready: boolean
  mode: DiscoverReadinessMode
  message: string
  action: string | null
}

export interface DiscoverStrategyPublic {
  id: string
  name: string
  category: DiscoverStrategyCategory
  tagline: string
  methodology: string
  description: string
  final_top_n: number
  condition_count: number
  source: DiscoverStrategySource
  profile: DiscoverStrategyProfile
  applicable_profiles: DiscoverStrategyProfile[]
  requires_pack: Array<'cn' | 'us' | 'crypto' | 'hk' | 'jp' | 'kr'>
  mining_ready: boolean
}

export interface CustomDiscoverStrategy {
  id: string
  name: string
  prompt: string
  tagline: string
  description: string
  methodology: string
  refinement_notes: string
  profile: DiscoverStrategyProfile
  copied_from: string | null
  created_at: string
  updated_at: string
}

export interface DiscoverStrategyDetail {
  id: string
  name: string
  category: DiscoverStrategyCategory
  tagline: string
  methodology: string
  description: string
  scorecard: string
  prescreen_top_n: number
  final_top_n: number
  conditions: Array<{ factor: string; op: string; value: number }>
  refinement_notes: string
  profile: DiscoverStrategyProfile
  applicable_profiles: DiscoverStrategyProfile[]
  requires_pack: Array<'cn' | 'us' | 'crypto' | 'hk' | 'jp' | 'kr'>
  source: 'builtin'
}

/** 发现页策略选择器统一条目 */
export interface DiscoverStrategyOption {
  id: string
  name: string
  tagline: string
  source: DiscoverStrategySource
  category?: DiscoverStrategyCategory
  profile?: DiscoverStrategyProfile
  meta?: string
}

export type MarketRegimeKind = 'panic' | 'cautious' | 'neutral' | 'euphoria'

export interface MarketRegimeIndicators {
  index_pe: number | null
  valuation_anchor: '低估区' | '合理' | '偏贵' | '高估区' | null
  marks_cycle: '极度悲观' | '悲观' | '中性' | '乐观' | '极度乐观' | null
  sentiment_score: number | null
  ma125_position_pct: number | null
  advance_pct: number | null
  turnover_vs_20d: number | null
  hv20_pct: number | null
  limit_up: number | null
  limit_down: number | null
  northbound_net_yi: number | null
  index_m6m: number | null
  index_m1m: number | null
  price_percentile_250d: number | null
}

export interface MarketRegimeData {
  scope?: 'cn' | 'us'
  regime: MarketRegimeKind
  headline: string
  detail: string
  suggested_strategy_ids: string[]
  suggested_by_profile?: Partial<Record<DiscoverStrategyProfile, string[]>>
  etf_regime_detail?: string
  regime_note?: string
  indicators: MarketRegimeIndicators
  timestamp?: string
}

export type DiscoverJobPhase = 'parsing' | 'prescreen' | 'mining' | 'done' | 'error'
export type DiscoverJobStatus = 'running' | 'done' | 'error' | 'cancelled'

export interface DiscoverFinalItem {
  rank: number
  code: string
  name: string
  match_score: number
  thesis: string
  highlights: string[]
  risks: string[]
  key_factors: Record<string, number>
}

export interface DiscoverRunResult {
  strategy_id: string | null
  strategy_title: string
  strategy_summary: string
  prompt: string
  plan: {
    strategy_title: string
    conditions: Array<{ factor: string; op: string; value: number }>
    prescreen_top_n: number
    final_top_n: number
    refinement_notes: string
    profile?: DiscoverStrategyProfile
  }
  prescreen: {
    scanned: number
    passed: number
    trade_date: string | null
    source: 'local' | 'live'
  }
  items: DiscoverFinalItem[]
  tools_used: string[]
}

export interface DiscoverJobSnapshot {
  id: string
  status: DiscoverJobStatus
  phase: DiscoverJobPhase
  message: string
  percent: number
  strategy_id: string
  strategy_name: string
  profile?: DiscoverStrategyProfile
  prompt: string
  model: string | null
  started_at: string
  updated_at: string
  result: DiscoverRunResult | null
  error: string | null
}

export interface StockPrepStep {
  id: string
  label: string
  status: 'pending' | 'running' | 'done' | 'error'
  message: string | null
}

export interface StockPrepSnapshot {
  code: string
  status: 'idle' | 'running' | 'done' | 'error'
  steps: StockPrepStep[]
  percent: number
  message: string | null
  started_at: string | null
  updated_at: string
  error: string | null
}

export interface SingleStrategySignal {
  name: string; direction: string
  confidence: number; detail?: string
}
export interface StrategySignalData {
  code: string; name: string; summary: string
  bullish_count: number; bearish_count: number; neutral_count: number
  score?: number; verdict?: string; confidence?: number
  signals: SingleStrategySignal[]; timestamp?: string
}

export type TrendStripTone = 'bullish' | 'bearish' | 'neutral' | 'caution' | 'muted'

export interface TrendStrip {
  id: string
  group: 'trend' | 'volume' | 'risk' | 'aux' | 'holding'
  title: string
  status: string
  detail: string
  tone: TrendStripTone
}

export interface TrendBriefData {
  code: string
  name: string
  as_of: string
  data_days: number
  strips: TrendStrip[]
  timestamp?: string
}

export interface StrategyPerformanceItem {
  name: string; overall_win_rate: number
  avg_return: number; sharpe: number | null
  signal_count: number
  buy_signals?: number; sell_signals?: number
  buy_win_rate?: number; sell_win_rate?: number
  precision?: number; recall?: number; signal_freq?: number
}
export interface StrategyVerifyData {
  code: string; name: string
  checkpoints: number; forward_days: number
  date_range: string[]; avg_win_rate: number
  best_strategy: { name: string; win_rate: number } | null
  performances: StrategyPerformanceItem[]
}

export interface PortfolioHoldingItem {
  code: string; name: string; weight: number; score: number | null
}
export interface FactorExposureItem {
  factor: string; category: string; active: number | null; interpretation: string
}
export interface PortfolioAnalysisData {
  num_stocks: number; weighted_score: number
  herfindahl: number; concentration_label: string
  industry_exposure: Record<string, number>
  holdings: PortfolioHoldingItem[]
  factor_exposures: FactorExposureItem[]
}

export interface IndustryStatItem {
  industry: string
  stock_count: number
  avg_score: number | null
  avg_pe: number | null
  avg_pb: number | null
  up_count: number
  down_count: number
  flat_count?: number
}

export interface IndustryStockItem {
  code: string
  name: string
  industry: string | null
  total_score: number | null
  price: number | null
  change_pct: number | null
}

export interface PortfolioTradeItem {
  id: number
  code: string
  name: string
  market?: string
  assetClass?: string
  instrument?: {
    market: string
    assetClass: string
    symbol: string
    exchange?: string
  }
  tradeSide: 'buy' | 'sell'
  shares: number
  price: number
  amount: number
  totalFee: number
  tradeDate: string
}

export interface PortfolioLedgerData {
  trades: PortfolioTradeItem[]
  count: number
}

export interface PortfolioSummaryData {
  totalCost: number; totalMarketValue: number
  totalUnrealizedPnl: number; totalRealizedPnl: number
  totalPnl: number; totalPnlPct: number
  holdingsCount: number; tradesCount: number
  holdings: {
    code: string; name: string; market?: string; assetClass?: string; shares: number
    costBasis: number; totalCost?: number; currentPrice: number
    marketValue: number; unrealizedPnl: number; unrealizedPnlPct: number
    realizedPnl?: number; totalPnl?: number; totalPnlPct?: number
  }[]
}

export interface MarketIndexQuote {
  code: string
  qt_code?: string
  name: string
  price: number | null
  change_pct: number | null
  change_amt?: number | null
  market?: string
  location?: string
  trade_state_label?: string
  quote_time?: string
  /** 美股 Tab：图表用 ETF ticker */
  chart_symbol?: string
  /** 同花顺板块/指数 thscode，用于成分股懒加载 */
  index_thscode?: string
  /** 板块分类：cn_concept | industry | tszs */
  sector_tag?: 'cn_concept' | 'industry' | 'tszs' | 'region'
}

export interface IndexConstituentItem {
  code: string
  name: string
  price?: number | null
  weight?: number | null
  change_pct?: number | null
  change_amt?: number | null
}

export interface IndexConstituentsData {
  index_code: string
  items: Array<Record<string, unknown>>
  count: number
  quoted_count?: number
  quote_limit?: number
  source?: string
}

export interface MarketDynamicsSection {
  id: string
  title: string
  hint?: string
  items: MarketIndexQuote[]
}

export interface MarketStockMover {
  code: string
  name: string
  price: number | null
  change_pct: number | null
  change_amt?: number | null
  rank?: number | null
}

export interface MarketDragonTigerItem {
  code: string
  name: string
  date: string
  reason?: string
  buy_amount?: number | null
  sell_amount?: number | null
  net_amount?: number | null
  price?: number | null
  change_pct?: number | null
  change_amt?: number | null
}

export interface MarketLimitUpItem {
  code: string
  name: string
  change_pct: number | null
  price?: number | null
  change_amt?: number | null
  reason?: string
  continue_day_text?: string
  board_label?: string
}

export interface MarketHotItem {
  code: string
  name: string
  rank?: number | null
  heat?: number | null
  rank_change?: number | null
  price?: number | null
  change_pct?: number | null
  change_amt?: number | null
}

export interface MarketLimitLadderBoard {
  key: string
  label: string
  items: Array<{
    code: string
    name: string
    board_num?: number
    price?: number | null
    change_pct?: number | null
    change_amt?: number | null
  }>
}

export interface MarketLimitLadder {
  date: string | null
  boards: MarketLimitLadderBoard[]
}

export interface MarketAnomalyItem {
  code: string
  name: string
  reason?: string
  tag?: string
  change_pct?: number | null
}

export interface MarketDynamicsData {
  market?: 'cn' | 'us' | 'hk'
  refreshed_at: string
  sections: MarketDynamicsSection[]
  cn_gainers?: MarketStockMover[]
  cn_losers?: MarketStockMover[]
  cn_dragon_tiger?: MarketDragonTigerItem[]
  cn_dragon_tiger_date?: string | null
  cn_limit_up?: MarketLimitUpItem[]
  cn_limit_break?: MarketLimitUpItem[]
  cn_skyrocket?: MarketHotItem[]
  cn_hot_stocks?: MarketHotItem[]
  cn_anomaly?: MarketAnomalyItem[]
  cn_limit_ladder?: MarketLimitLadder | null
  cn_emotion_source?: 'tonghuashun' | null
  cn_sector_status?: 'ok' | 'empty' | 'error'
  cn_sector_hint?: string
  us_indices?: MarketIndexQuote[]
  us_gainers?: MarketStockMover[]
  us_losers?: MarketStockMover[]
  us_trending?: MarketStockMover[]
  us_trending_jp?: MarketStockMover[]
  hk_indices?: MarketIndexQuote[]
  hk_gainers?: MarketStockMover[]
  hk_losers?: MarketStockMover[]
  hk_trending?: MarketStockMover[]
  hk_sector_status?: 'ok' | 'empty' | 'error'
  hk_sector_hint?: string
  /** Hub 返回：数据来自服务端持久化缓存 */
  from_cache?: boolean
}

export interface StockSearchItem {
  code: string; name: string; industry?: string
}
export interface SearchStocksData {
  keyword: string; results: StockSearchItem[]
}

export interface FactorICItem {
  factor_name: string
  mean_ic: number | null; icir: number | null
  hit_rate: number | null; n_periods: number
}
export interface BacktestResultData {
  n_periods: number; universe_size: number
  factor_ics: FactorICItem[]; scorecard_ics: FactorICItem[]
}

export interface LatestEvalData {
  code: string; name: string; timestamp: string
  scorecard: string; total_score: number
  factors: Record<string, number | null>
  scorecard_dimensions?: ScorecardDimension[]
  gbm?: { b_score: number; m_score: number } | null
  from_store?: boolean
}

export interface WatchlistRadarItem {
  code: string
  name: string
  total_score: number | null
  scorecard: string | null
  from_store: boolean
  pe: number | null
  pb: number | null
  pe_percentile: number | null
  pb_percentile: number | null
  main_net: number | null
  flow_date: string | null
}

export interface WatchlistRadarData {
  items: WatchlistRadarItem[]
}

export interface ReportTextData {
  code: string; name: string; report_type: string; text: string
}

// ─── News feed ───
export type FeedSourceKind = 'rss' | 'atom' | 'rsshub'

export interface FeedGroup {
  id: string
  title: string
  sort_order: number
  created_at: string
}

export interface FeedSubscription {
  id: string
  title: string
  url: string
  resolved_url: string
  kind: FeedSourceKind
  enabled: boolean
  group_id?: string | null
  created_at: string
  last_fetched_at?: string
  last_error?: string
}

export interface FeedArticle {
  id: string
  subscription_id: string
  /** RSS guid / atom id / link used for source-level dedupe */
  guid?: string
  title: string
  link: string
  pub_date: string
  summary?: string
  content_html?: string
  source_title: string
}

export interface NewsEnrichmentSettings {
  enabled: boolean
  processing_mode: 'on_demand' | 'background'
  /** @deprecated */
  auto_on_refresh?: boolean
  extract_images: boolean
  extract_audio: boolean
  extract_video: boolean
  service_mode: 'offline' | 'remote'
  offline_vision_model: string
  offline_whisper_model: string
  remote_provider_id: string | null
  remote_model: string | null
}

export interface NewsSettings {
  refresh_interval_min: number
  retention_years: number
  max_articles: number | null
  translation: NewsTranslationSettings
  enrichment: NewsEnrichmentSettings
}

export type TranslationServiceMode = 'offline' | 'remote'

export interface NewsTranslationSettings {
  service_mode: TranslationServiceMode
  offline_model: string
  remote_provider_id: string | null
  remote_model: string | null
}

export type DerivedSegmentKind = 'html_text' | 'image_ocr' | 'audio_asr' | 'video_asr'

export interface ArticleDerivedSegment {
  id: string
  kind: DerivedSegmentKind
  text: string
  lang?: string
  confidence?: number
  anchor: {
    media_src?: string
    block_id?: string
    insert: 'after_media' | 'figcaption' | 'append_block'
  }
  model?: string
  created_at: string
}

export type ArticleEnrichmentStatus = 'pending' | 'running' | 'ready' | 'partial' | 'failed'

export interface ArticleEnrichment {
  article_id: string
  status: ArticleEnrichmentStatus
  segments: ArticleDerivedSegment[]
  errors?: Array<{ segment_id: string; message: string }>
  updated_at: string
  version: 1
}

export interface MultimodalRuntimeStatus {
  platform: string
  ffmpeg: { ready: boolean; path: string | null }
  sensevoice: {
    modelName: string
    ready: boolean
    modelsDir: string
    source?: 'bundled' | 'user' | 'missing'
  }
}

export interface MultimodalStatusResponse {
  settings: NewsEnrichmentSettings
  runtime: MultimodalRuntimeStatus
  remoteConfigured: boolean
  remoteProviderName: string | null
  canEnrichImages: boolean
  canEnrichSpeech: boolean
  canEnrich: boolean
  /** SenseVoice ensure 异步任务快照（轮询进度） */
  sensevoiceEnsure?: {
    phase: 'idle' | 'preparing' | 'downloading' | 'ready' | 'error'
    message: string
    accepted: boolean
    started: boolean
    percent: number
    modelName: string
    ready: boolean
    modelsDir: string
    source: 'bundled' | 'user' | 'missing'
    error: string | null
  }
  translation?: {
    offlineEnabled: boolean
    modelInstalled: boolean
    modelName: string | null
    downloading: boolean
  }
}

export interface FeedPageResult {
  articles: FeedArticle[]
  next_cursor: string | null
  has_more: boolean
  total: number
  refreshed_at: string | null
  stale: boolean
}

export interface NewsGroupedFeed {
  groups: Array<{ id: string; title: string; articles: FeedArticle[] }>
  ungrouped: FeedArticle[]
  by_source: Array<{ subscription_id: string; title: string; articles: FeedArticle[] }>
}

export interface ValidateFeedResult {
  ok: boolean
  title: string
  item_count: number
  kind: FeedSourceKind
  resolved_url: string
  error?: string
}

// ─── Community feed (Discourse proxy) ───

export type CommunityCategoryFeedKind = 'research_strategy' | 'lounge'
export type CommunityFeedKind = 'latest' | 'hot' | CommunityCategoryFeedKind

export interface CommunityTopic {
  id: number
  title: string
  excerpt: string | null
  url: string
  categoryId: number | null
  categoryName: string | null
  categoryColor: string | null
  authorUsername: string | null
  postsCount: number
  replyCount: number
  likeCount: number
  views: number
  tags: string[]
  pinned: boolean
  lastPostedAt: string | null
  createdAt: string | null
}

export interface CommunityFeedResponse {
  success: boolean
  kind: CommunityFeedKind
  topics: CommunityTopic[]
  page: number
  perPage: number
  hasMore: boolean
  fetchedAt: string
  error?: string
}

// ─── Unified API response ───
export interface ApiResponse<T = any> {
  success: boolean
  feature: string
  data: T
  message?: string
  elapsed?: number
}

// ─── Feature routes ───
export type FeatureRoute =
  | 'dashboard' | 'stock_research' | 'portfolio_hub'
  | 'settings'

export interface NavItem {
  id: FeatureRoute
  label: string
  icon: string
}
