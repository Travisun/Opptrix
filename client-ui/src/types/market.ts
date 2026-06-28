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

export interface StockProfileData {
  code: string
  name?: string
  orgName?: string
  industry?: string
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
  website?: string
  regCapital?: number | null
  chairman?: string
  legalPerson?: string
  secretary?: string
  orgTel?: string
  securityType?: string
  formerName?: string
  issuePrice?: number | null
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

export type ChartPeriod = 'intraday' | '1m' | '5m' | '15m' | '30m' | '60m' | 'daily' | 'weekly' | 'monthly'

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
  isTradingDay: boolean
  hasMore?: boolean
  bars: IntradayChartBar[] | OhlcChartBar[]
  indicators: ChartIndicatorPoint[]
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
