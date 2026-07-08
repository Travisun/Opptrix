/** Shared research API types — aligned with client-ui schemas */

export type FactorCategory =
  | 'valuation' | 'growth' | 'quality' | 'momentum'
  | 'technical' | 'risk' | 'cashflow' | 'composite'

export interface ResearchResult<T = unknown> {
  success: boolean
  data?: T
  message: string
  elapsed: number
}

export interface ApiEnvelope<T = unknown> {
  success: boolean
  feature: string
  data: T
  message?: string
  elapsed?: number
}

export interface QueryResult<T> {
  success: boolean
  data?: T
  source?: string
  cached?: boolean
  error?: string
}

export interface StockRealtime {
  code: string
  name: string
  price: number | null
  changePct: number | null
  pe: number | null
  pb: number | null
  turnoverRate: number | null
  marketCap?: number | null
  /** 流通市值（元） */
  circulatingMarketCap?: number | null
  open?: number | null
  high?: number | null
  low?: number | null
  preClose?: number | null
  volume?: number | null
  amount?: number | null
  change?: number | null
  amplitude?: number | null
  volumeRatio?: number | null
  timestamp?: string
  /** US equities — trading session for displayed price */
  quoteSession?: 'pre' | 'regular' | 'post' | 'closed'
  /** User-facing session label (e.g. 盘前 / 盘中) */
  sessionLabel?: string
  preMarketPrice?: number | null
  postMarketPrice?: number | null
}

export interface StockKline {
  code: string
  date: string
  open: number
  close: number
  high: number
  low: number
  volume: number
  amount: number
  changePct: number | null
  turnoverRate: number | null
}

export interface FinancialSummary {
  code: string
  reportDate: string
  reportType?: string
  revenue: number | null
  revenueYoy: number | null
  netProfit: number | null
  netProfitYoy: number | null
  eps: number | null
  roe: number | null
  grossMargin: number | null
  netMargin?: number | null
  debtRatio: number | null
  operatingCashFlow: number | null
  bps?: number | null
  totalAssets?: number | null
  totalLiabilities?: number | null
}

export interface StockListItem {
  code: string
  name: string
  industry: string
  market: string
}

export interface FactorMeta {
  name: string
  category: FactorCategory
  description: string
  higherIsBetter: boolean
}

export interface FactorResult {
  name: string
  value: number | null
  meta: FactorMeta
  details?: Record<string, unknown>
}

export interface StockSnapshot {
  code: string
  name: string
  factors: Record<string, FactorResult | null>
  scores: Record<string, number>
  totalScore: number
}

export type RatingLevel =
  | 'strong_sell' | 'sell' | 'hold' | 'watch' | 'buy' | 'strong_buy'

export type MethodSource = 'documented' | 'partial' | 'research_style' | 'behavioral'

export interface EvalDimension {
  name: string
  score: number
  weight: number
  detail: string
}

export interface InstitutionRatingItem {
  institution: string
  institutionShort: string
  rating: RatingLevel
  ratingCn: string
  confidence: number
  rawConfidence: number
  methodSource: MethodSource
  modelName: string
  summary: string
  group: string
  dimensions?: EvalDimension[] | null
}
