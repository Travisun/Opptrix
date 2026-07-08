export interface WatchlistItem {
  code: string
  name: string
  industry?: string
  /** 用户备注 */
  note?: string
  /** ISO date when added to follow list */
  addedAt?: string
  /** Reference price when added — for follow return */
  addedPrice?: number | null
  /** Multi-market identity — inferred from code when absent */
  instrument?: import('./instrument').InstrumentRef
}

export interface MarketQuote {
  code: string
  name: string
  price: number | null
  changePct: number | null
  pe: number | null
  pb: number | null
  turnoverRate: number | null
  marketCap?: number | null
  open?: number | null
  high?: number | null
  low?: number | null
  preClose?: number | null
  volume?: number | null
  amount?: number | null
  change?: number | null
  amplitude?: number | null
  volumeRatio?: number | null
}

export interface ProfileMetricItem {
  label: string
  value: string
}

export interface ProfilePlateItem {
  name: string
  code?: string
  changePct?: number | null
  tag?: string
}

export interface ProfileExecutive {
  name: string
  title?: string
  startDate?: string
  endDate?: string
}

export interface ProfileIndustryRank {
  industryName: string
  industryCode?: string
  pe?: number | null
  marketCap?: number | null
  eps?: number | null
  peRank?: number | string | null
  marketCapRank?: number | string | null
  epsRank?: number | string | null
  industryAvgPe?: number | null
}

export interface ProfileInstitutionRating {
  period?: string
  buy?: number | null
  outperform?: number | null
  neutral?: number | null
  underperform?: number | null
  sell?: number | null
  targetPriceAvg?: string
  targetPriceHigh?: string
  targetPriceLow?: string
  recentReports?: Array<{ title: string; date?: string; rating?: string }>
}

export interface ProfileIndexMembership {
  indexName: string
  indexCode?: string
  enterDate?: string
}

export interface StockProfileData {
  code: string
  name?: string
  orgName?: string
  orgNameEn?: string
  industry?: string
  industrySecondary?: string
  industryCsrc?: string
  concepts?: string[]
  listingDate?: string
  foundDate?: string
  mainBusiness?: string
  orgProfile?: string
  businessScope?: string
  totalMarketCap?: number | null
  circulatingMarketCap?: number | null
  employees?: number | null
  province?: string
  city?: string
  address?: string
  officeAddress?: string
  website?: string
  orgEmail?: string
  orgFax?: string
  leadUnderwriter?: string
  regCapital?: number | null
  chairman?: string
  legalPerson?: string
  secretary?: string
  orgTel?: string
  securityType?: string
  formerName?: string
  issuePrice?: number | null
  totalShares?: number | null
  weekDividendYield?: number | null
  metricsReportDate?: string
  profileMetrics?: ProfileMetricItem[]
  industryPlates?: ProfilePlateItem[]
  conceptPlates?: ProfilePlateItem[]
  areaPlates?: ProfilePlateItem[]
  indexMembership?: ProfileIndexMembership[]
  executives?: ProfileExecutive[]
  industryRank?: ProfileIndustryRank
  institutionRating?: ProfileInstitutionRating
  revenueBreakdown?: RevenueBreakdownBlock[]
}

export interface RevenueSegment {
  label: string
  sales?: string
  ratio?: string
}

export interface RevenueBreakdownBlock {
  date: string
  currency?: string
  segments: RevenueSegment[]
}

export interface FinancialSummaryData {
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

export interface StockKlineBar {
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

export type ChartPeriod =
  | 'intraday'
  | '1m' | '5m' | '15m' | '30m' | '60m'
  | 'daily' | '5day' | 'weekly' | 'monthly'
  | 'year1' | 'year3' | 'year5'

export interface IntradayChartBar {
  time: string
  price: number
  volume: number
  amount: number
  avgPrice: number
}

export interface OhlcChartBar {
  time: string
  open: number
  high: number
  low: number
  close: number
  volume: number
  amount: number
  changePct: number | null
  turnoverRate: number | null
}

export interface ChartIndicatorPoint {
  time: string
  ma5: number | null
  ma10: number | null
  ma20: number | null
  ma60: number | null
  rsi6: number | null
  rsi12: number | null
  macd: number | null
  macdSignal: number | null
  macdHist: number | null
}

/** 筹码分布（CYQ）— 与东财 K 线筹码字段对齐 */
export interface ChipDistributionPoint {
  date: string
  /** 获利比例 0–1 */
  benefitPart: number
  avgCost: number
  cost90Low: number
  cost90High: number
  cost90Con: number
  cost70Low: number
  cost70High: number
  cost70Con: number
}

export interface ChipPriceLevelPoint {
  price: number
  /** Normalized chip weight 0–1 */
  weight: number
}

export interface ChipDistributionProfileData {
  date: string
  currentPrice: number
  levels: ChipPriceLevelPoint[]
}

export interface StockChartData {
  code: string
  name: string
  period: ChartPeriod
  preClose: number | null
  /** Intraday session trade date (YYYY-MM-DD); null when unavailable. */
  sessionDate?: string | null
  isTradingDay: boolean
  hasMore?: boolean
  bars: IntradayChartBar[] | OhlcChartBar[]
  indicators: ChartIndicatorPoint[]
  /** IANA timezone for cross-market intraday parsing */
  chartTimeZone?: string
  cyqLatest?: ChipDistributionPoint | null
  cyqProfile?: ChipDistributionProfileData | null
}

export interface StockQuotesData {
  quotes: MarketQuote[]
}

export interface StockKlineData {
  code: string
  klines: StockKlineBar[]
}

export interface StockNewsItem {
  code: string
  title: string
  date: string
  url?: string
  type?: string
}

export interface StockDividendItem {
  code: string
  year?: string
  cashBonus?: number | null
  exDate?: string
  recordDate?: string
  payDate?: string
  plan?: string
  progress?: string
}

export interface StockMoneyFlowItem {
  code: string
  date: string
  mainNet?: number | null
  mainNetPct?: number | null
  changePct?: number | null
}

export interface TopShareholderItem {
  rank: number
  name: string
  sharesHeld?: number | null
  sharePct?: number | null
  change?: number | null
  shareType?: string
}

export interface CrossMarketRelatedStock {
  code: string
  name: string
  market: 'US' | 'HK'
  price?: number | null
  changePct?: number | null
}

export interface SeniorTradeItem {
  code: string
  personName: string
  tradeDate: string
  shares?: number | null
  value?: number | null
  detail?: string
}

export interface TradingDistributionLevel {
  price: number | null
  volume: number | null
  volumeRatio: number | null
}

export interface TradingDistributionData {
  code: string
  priceLevels: TradingDistributionLevel[]
  largeOrderPct: number | null
}

export interface StockShareholderData {
  code?: string
  reportDate?: string
  shareholderCount?: number | null
  shareholderCountChange?: number | null
  avgHoldingValue?: number | null
  holdFocus?: string
  avgFreeShares?: number | null
  top10Shareholders?: TopShareholderItem[]
}

export interface StockDetailData {
  code: string
  name: string
  quote: MarketQuote | null
  profile: StockProfileData | null
  financial: FinancialSummaryData | null
  financialHistory?: FinancialSummaryData[]
  news?: StockNewsItem[]
  dividends?: StockDividendItem[]
  moneyFlow?: StockMoneyFlowItem[]
  shareholders?: StockShareholderData | null
}

export interface EtfProfileData {
  code: string
  name?: string
  nav?: number | null
  changePct?: number | null
  premiumRate?: number | null
  fundType?: string
  trackingIndex?: string
  manager?: string
  expenseRatio?: number | null
  totalShares?: number | null
  listingDate?: string
  benchmark?: string
  scale?: number | null
}

export interface EtfNavPoint {
  code?: string
  date: string
  nav?: number | null
  accNav?: number | null
  changePct?: number | null
  premiumRate?: number | null
}

export interface EtfHoldingRow {
  code?: string
  reportDate: string
  holdingSymbol: string
  holdingName?: string
  weight?: number | null
  shares?: number | null
  marketValue?: number | null
}

export interface EtfSnapshotData {
  code: string
  profile: EtfProfileData | null
  nav: EtfNavPoint | null
  quote: MarketQuote | null
}

export interface EtfScorecardDimension {
  key: string
  label: string
  weight: number
  score: number | null
  value: string | null
  hint: string | null
}

export interface EtfScorecardData {
  code: string
  name: string
  scorecard: string
  total_score: number | null
  grade: string | null
  dimensions: EtfScorecardDimension[]
  highlights: string[]
  risks: string[]
  source: 'local'
  data_as_of: string | null
}

export interface CrossMarketQuote {
  code: string
  name?: string
  price: number | null
  changePct: number | null
  change?: number | null
  open?: number | null
  high?: number | null
  low?: number | null
  preClose?: number | null
  volume?: number | null
  amount?: number | null
  pe?: number | null
  pb?: number | null
  turnoverRate?: number | null
  amplitude?: number | null
  volumeRatio?: number | null
  marketCap?: number | null
  circulatingMarketCap?: number | null
  week52High?: number | null
  week52Low?: number | null
  currency?: string | null
  quoteSession?: 'pre' | 'regular' | 'post' | 'closed'
  sessionLabel?: string
  preMarketPrice?: number | null
  postMarketPrice?: number | null
}

export interface CrossMarketKlineBar {
  code?: string
  date: string
  open: number
  close: number
  high: number
  low: number
  volume: number
  changePct: number | null
}

export interface UsSnapshotData {
  code: string
  name?: string
  profile: Record<string, unknown> | null
  quote: CrossMarketQuote | null
  recentKlines: CrossMarketKlineBar[]
  financial?: FinancialSummaryData | null
  financialHistory?: FinancialSummaryData[]
  /** @deprecated 使用 notices */
  news?: StockNewsItem[]
  notices?: StockNewsItem[]
  articles?: StockNewsItem[]
  dividends?: StockDividendItem[]
  shareholders?: StockShareholderData | null
  reviewProspect?: { review: string | null; prospect: string | null } | null
  relatedStocks?: CrossMarketRelatedStock[]
  seniorTrades?: SeniorTradeItem[]
  tradingDistribution?: TradingDistributionData | null
}

export interface CryptoSnapshotData {
  pair: string
  quote: CrossMarketQuote | null
  recentKlines: CrossMarketKlineBar[]
}

export interface EtfListItem {
  code: string
  name: string
  nav?: number | null
  changePct?: number | null
  premiumRate?: number | null
  fundType?: string
  trackingIndex?: string
  manager?: string
}

export interface MarketDbStatusData {
  db_path: string
  schema_version: number
  stock_count: number
  etf_count?: number
  us_count?: number
  crypto_count?: number
  latest_trade_date: string | null
  latest_factor_date: string | null
  profile_count: number
  partner_count: number
  segment_count: number
  announcement_count: number
  dividend_count: number
  shareholder_count: number
  forecast_count: number
  inst_holding_count: number
  insider_trade_count: number
  buyback_count: number
  last_sync: Record<string, string | null>
  job_progress: Record<string, { done: number; error: number; pending: number }>
  is_ready: boolean
  bootstrap?: {
    ready: boolean
    initial_cn?: boolean
    initial_hk?: boolean
    initial_us?: boolean
    initial_cn_etf?: boolean
    initial_taxonomy?: boolean
    universe: boolean
    quotes: boolean
    klines: boolean
    fundamentals: boolean
    screen_factors: boolean
    quote_stock_ratio?: number
    kline_stock_ratio?: number
    fin_stock_ratio?: number
    factor_stock_ratio?: number
  }
}

export interface MarketDataSyncState {
  running: boolean
  mode: 'full' | 'incremental' | 'resume' | null
  session_id: number | null
  started_at: string | null
  finished_at: string | null
  current_job: string | null
  job_current: number
  job_total: number
  job_batch_current: number | null
  job_batch_total: number | null
  jobs_completed: number
  jobs_total: number
  overall_percent: number
  message: string | null
  logs: string[]
  db_status: MarketDbStatusData
}
