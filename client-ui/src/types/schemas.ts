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

export interface ScreenedItem {
  code: string; name: string
  total_score: number; key_factors: Record<string, number>
}
export interface ScreeningData {
  total_scanned: number; passed: number
  scorecard: string; items: ScreenedItem[]
  source?: 'local' | 'live'
  trade_date?: string | null
}

export type DiscoverStrategyCategory = 'value' | 'growth' | 'quality' | 'momentum' | 'balanced'

export type DiscoverStrategySource = 'builtin' | 'custom'

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
}

export interface CustomDiscoverStrategy {
  id: string
  name: string
  prompt: string
  tagline: string
  description: string
  methodology: string
  refinement_notes: string
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
  source: 'builtin'
}

/** 发现页策略选择器统一条目 */
export interface DiscoverStrategyOption {
  id: string
  name: string
  tagline: string
  source: DiscoverStrategySource
  category?: DiscoverStrategyCategory
  meta?: string
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

export interface IndustryMiningData {
  industry: string; summary: string
  chain_overview: string; key_companies: number
  mermaid?: string
}

export interface PortfolioTradeItem {
  id: number; code: string; name: string
  tradeSide: 'buy' | 'sell'; shares: number; price: number
  amount: number; totalFee: number; tradeDate: string
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
    code: string; name: string; shares: number
    costBasis: number; totalCost?: number; currentPrice: number
    marketValue: number; unrealizedPnl: number; unrealizedPnlPct: number
    realizedPnl?: number; totalPnl?: number; totalPnlPct?: number
  }[]
}

export interface MarketReportData {
  report_type: string; title: string
  summary: string; sections: { title: string; content: string }[]
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
  | 'dashboard' | 'stock_research' | 'portfolio_hub' | 'market_insight'
  | 'settings'

export interface NavItem {
  id: FeatureRoute
  label: string
  icon: string
}
