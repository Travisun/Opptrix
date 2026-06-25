/* ──── Auto-generated from Python schemas ──── */

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
}

export interface SingleStrategySignal {
  name: string; direction: string
  confidence: number; detail?: string
}
export interface StrategySignalData {
  code: string; name: string; summary: string
  bullish_count: number; bearish_count: number; neutral_count: number
  signals: SingleStrategySignal[]; timestamp?: string
}

export interface StrategyPerformanceItem {
  name: string; overall_win_rate: number
  avg_return: number; sharpe: number | null
  signal_count: number
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
  | 'diagnosis' | 'screening' | 'institution_rating'
  | 'strategy_signals' | 'portfolio' | 'market_report'
  | 'industry_mining' | 'backtest' | 'settings'

export interface NavItem {
  id: FeatureRoute
  label: string
  icon: string
}
