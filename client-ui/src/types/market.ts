
/** 关注项多命中候选 — 仅列表接口短暂带回，不持久化 */
export interface DisambiguationCandidate {
  instrument: import('./instrument').InstrumentRef
  name: string | null
  code: string
}

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

export interface WatchlistGroup {
  id: string
  title: string
  sortOrder: number
  createdAt?: string
}

export interface WatchlistGroupsDocument {
  groups: WatchlistGroup[]
  membership: Record<string, string[]>
}

/** 虚拟「全部」筛选器 — 不落库 */
export const WATCHLIST_ALL_GROUP_ID = '__all__'

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
  | 'daily' | '5day' | 'weekly' | 'monthly' | 'quarterly' | 'yearly'
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
  fullName?: string
  nav?: number | null
  accNav?: number | null
  navDate?: string
  changePct?: number | null
  changeAmt?: number | null
  premiumRate?: number | null
  latestPrice?: number | null
  open?: number | null
  high?: number | null
  low?: number | null
  volume?: number | null
  amount?: number | null
  fundType?: string
  trackingIndex?: string
  manager?: string
  company?: string
  custodian?: string
  expenseRatio?: number | null
  totalShares?: number | null
  scale?: number | null
  totalAUM?: string
  listingDate?: string
  establishDate?: string
  benchmark?: string
  totalDividends?: number | null
  dividendCount?: number | null
  reportDate?: string
  reportPeriods?: string[]
  assetAllocation?: Array<{ name: string; ratio: string }>
  industryAllocation?: Array<{ name: string; ratio: string }>
  topHoldings?: Array<{ name: string; code: string; ratio: string; rate?: string }>
  bondHoldings?: Array<{ name: string; ratio?: string }>
  fundHoldings?: Array<{ name: string; ratio?: string }>
  commodityHoldings?: Array<{ name: string; ratio?: string }>
  productHoldings?: Array<{ name: string; ratio?: string }>
  totalStock?: number | null
  totalBond?: number | null
  totalFund?: number | null
  totalCommodity?: number | null
  totalProduct?: number | null
  performance?: {
    w1?: number | null
    w4?: number | null
    w13?: number | null
    w26?: number | null
    w52?: number | null
    year?: number | null
    total?: number | null
    year3?: number | null
  }
  avgPerformance?: {
    w1?: number | null
    w4?: number | null
    w13?: number | null
    w26?: number | null
    w52?: number | null
    year?: number | null
    total?: number | null
    year3?: number | null
  }
  rankTotal?: number | null
  holderAmount?: number | null
  avgHolderShare?: number | null
  instHolderRatio?: number | null
  indivHolderRatio?: number | null
  holderReportDate?: string
  source?: string
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
  assetType?: string
}

/** 费率条目 — 与数据层 profile.rateInfo 对齐（label 标准；name 兼容） */
export interface FundRateInfoItem {
  label?: string
  name?: string
  rate?: number | null
  note?: string
}

/** 基金经理详情 — 与 fund_detail.manager 对齐 */
export interface FundManagerData {
  name?: string
  managerId?: string
  years?: number | null
  gender?: string
  education?: string
  resume?: string
  style?: string
  philosophy?: string
  experience?: string
  representFunds?: string[]
  scale?: number | null
  performanceSummary?: string
  startDate?: string
  endDate?: string
  officeDays?: number | null
  tenureReturn?: number | null
}

/** 诊断单维 */
export interface FundDiagnosisDimension {
  name: string
  score?: number | null
  label?: string
  peerAvg?: number | null
  detail?: string
}

/** 基金诊断 — 与 fund_detail.diagnosis 对齐 */
export interface FundDiagnosisData {
  dimensions?: FundDiagnosisDimension[]
  resilience?: string | number | null
  summary?: string
}

/** 基金资讯 — 与 fund_detail.news 对齐 */
export interface FundNewsItem {
  title: string
  date: string
  url?: string
}

/** 财务摘要 — 可嵌在档案底部；indicators 为扶摇关键指标行 */
export interface FundFinancialSummary {
  reportDate?: string
  revenue?: number | null
  revenueYoy?: number | null
  netProfit?: number | null
  netProfitYoy?: number | null
  eps?: number | null
  roe?: number | null
  grossMargin?: number | null
  debtRatio?: number | null
  indicators?: Array<{ label: string; value?: number | string | null; unit?: string }>
}

export interface FundProfileData {
  code: string
  name?: string
  fullName?: string
  unitNav?: number | null
  /** 扶摇路径下为复权净值（adj_nav），字段名历史兼容 */
  accNav?: number | null
  navDate?: string
  changePct?: number | null
  fundType?: string
  manager?: string
  managerId?: string
  managerStartDate?: string
  managerEndDate?: string
  managerOfficeDays?: number | null
  managerTenureReturn?: number | null
  company?: string
  companyId?: string
  companyType?: string
  companyFundCount?: number | null
  companyScale?: number | null
  companyEstablishDate?: string
  custodian?: string
  expenseRatio?: number | null
  rateInfo?: FundRateInfoItem[]
  purchaseFee?: number | null
  redeemFee?: number | null
  riskLevel?: string
  scale?: number | null
  totalShares?: number | null
  benchmark?: string
  establishDate?: string
  return1y?: number | null
  investTarget?: string
  investScope?: string
  investPhilosophy?: string
  investStrategy?: string
  /** 交易规则（可读文案） */
  tradeRules?: string[]
  performance?: FundPerformance
  holderAmount?: number | null
  avgHolderShare?: number | null
  instHolderRatio?: number | null
  indivHolderRatio?: number | null
  mgmtStaffHoldRatio?: number | null
  holderReportDate?: string
  source?: string
}

export interface FundPerformance {
  w1?: number | null
  w4?: number | null
  w13?: number | null
  w26?: number | null
  w52?: number | null
  year?: number | null
  year2?: number | null
  year3?: number | null
  year5?: number | null
  total?: number | null
}

export interface FundRankCell {
  rank?: number | null
  total?: number | null
}

export interface FundReturnsData {
  performance?: FundPerformance
  ranks?: Partial<Record<keyof FundPerformance, FundRankCell>>
  peerAvg?: FundPerformance
}

export interface FundDrawdownRow {
  period: string
  label: string
  value?: number | null
}

export interface FundAllocItem {
  name: string
  ratio?: number | null
}

export interface FundAllocationData {
  reportDate?: string
  assets: FundAllocItem[]
  industries: FundAllocItem[]
}

export interface FundHolderTopRow {
  name: string
  share?: number | null
  ratio?: number | null
}

export interface FundHoldersData {
  holderAmount?: number | null
  avgHolderShare?: number | null
  instHolderRatio?: number | null
  indivHolderRatio?: number | null
  mgmtStaffHoldRatio?: number | null
  holderReportDate?: string
  top: FundHolderTopRow[]
}

export interface FundDividendRow {
  date: string
  recordDate?: string
  amount?: number | null
  type?: string
  dividendCount?: number | null
  dividendTotal?: number | null
}

export interface FundNavPoint {
  date: string
  nav?: number | null
  accNav?: number | null
  changePct?: number | null
}

export interface FundHoldingRow {
  reportDate: string
  holdingSymbol: string
  holdingName?: string
  weight?: number | null
  shares?: number | null
  marketValue?: number | null
  assetType?: string
}

export interface FundSnapshotData {
  code: string
  profile: FundProfileData | Record<string, unknown> | null
  nav: FundNavPoint | Record<string, unknown> | null
  quote: Record<string, unknown> | null
}

export interface FundDetailData {
  code: string
  snapshot: FundSnapshotData | null
  holdings: FundHoldingRow[]
  returns: FundReturnsData | null
  drawdowns: FundDrawdownRow[]
  allocation: FundAllocationData | null
  holders: FundHoldersData | null
  dividends: FundDividendRow[]
  /** 经理详情；无则仅档案里的姓名 */
  manager?: FundManagerData | null
  diagnosis?: FundDiagnosisData | null
  news?: FundNewsItem[]
  financials?: FundFinancialSummary | null
  failed: string[]
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
  source: 'local' | 'online'
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
  /** 主数据 DuckDB 路径 */
  db_path: string
  control_db_path?: string
  duck_db_path?: string
  primary_storage?: 'duckdb'
  schema_version: number
  stock_count: number
  etf_count?: number
  us_count?: number
  crypto_count?: number
  jp_count?: number
  kr_count?: number
  hk_count?: number
  latest_trade_date: string | null
  latest_factor_date: string | null
  kline_dates?: Record<string, string | null>
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
    quote_stock_ratio?: number
    kline_stock_ratio?: number
    kline_recent_ratio?: number
    fin_stock_ratio?: number
    factor_stock_ratio?: number
  }
  derived?: {
    ready: boolean
    klines_prerequisite: boolean
    industry_stats: boolean
    factor_coverage_ratio: number
    factor_trade_date: string | null
    kline_trade_date: string | null
    industry_trade_date: string | null
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
  failed_jobs?: Array<{ job: string; error: string }>
  db_status: MarketDbStatusData
}
