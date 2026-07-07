/**
 * 新浪财经 Provider 标准化响应类型。
 *
 * 所有 {@link SINA_SOURCE} 字段固定为 `sinafinance`；
 * 能力层（Capability）返回的数组元素均遵循下列结构，便于前端与 Agent 统一消费。
 *
 * @packageDocumentation
 */

/** 统一数据源标识 */
export const SINA_SOURCE = 'sinafinance' as const

export type SinaSource = typeof SINA_SOURCE

/** 带数据源标记的基础行 */
export interface SinaBaseRow {
  /** 6 位 A 股代码 */
  code: string
  /** 固定 `sinafinance` */
  source: SinaSource
}

/** 股东持股行 — `SHAREHOLDER` / `sinaMajorShareholders` / `sinaCirculateShareholders` */
export interface SinaShareholderRecord extends SinaBaseRow {
  type: 'meta' | 'holder'
  /** `major` 主要股东；`float` 流通股东 */
  holderCategory?: 'major' | 'float'
  rank?: number
  name?: string
  shares?: string
  ratio?: string
  shareType?: string
  asOfDate?: string
  announceDate?: string
  holderCount?: string
}

/** 高管 — `sinaExecutives` / `MANAGER_INFO` 扩展 */
export interface SinaExecutiveRecord extends SinaBaseRow {
  name: string
  title?: string
  startDate?: string
  endDate?: string
}

/** 分红 — `DIVIDEND` / `sinaDividends` */
export interface SinaDividendRecord extends SinaBaseRow {
  year?: string
  cashBonus?: number | null
  stockBonus?: number | null
  exDate?: string
  recordDate?: string
  progress?: string
  plan?: string
}

/** 财务透视表原始结构 — `sinaFinancialPivot` */
export interface SinaFinancialPivotRecord {
  periods: string[]
  metrics: Record<string, string[]>
  source: SinaSource
}

/** 限售解禁 — `sinaShareUnlock` / `LOCKUP_EXPIRY` */
export interface SinaShareUnlockRecord extends SinaBaseRow {
  name?: string
  unlockDate: string
  unlockShares?: string
  unlockMarketValue?: string
  batch?: string
  announceDate?: string
}

/** 融资融券 — `sinaMarginTrading` / `MARGIN_TRADE` */
export interface SinaMarginTradeRecord extends SinaBaseRow {
  name?: string
  marginBalance?: string
  marginBuy?: string
  marginRepay?: string
  shortBalance?: string
  shortVolume?: string
  shortSell?: string
  shortRepay?: string
}

/** 大宗交易 — `BLOCK_TRADE` */
export interface SinaBlockTradeRecord extends SinaBaseRow {
  tradeDate: string
  name?: string
  price?: number | null
  volume?: number | null
  amount?: number | null
  buyer?: string
  seller?: string
}

/** 分价统计 — `sinaPriceDistribution` */
export interface SinaPriceLevelRecord extends SinaBaseRow {
  price?: number | null
  volume?: number | null
  ratio?: string
}

/** 大单成交 — `sinaLargeOrders` */
export interface SinaLargeOrderRecord extends SinaBaseRow {
  time: string
  volume?: number | null
  price?: number | null
  /** `UP` / `DOWN` */
  direction?: string
}

/** 业绩预告 — `perfForecast` / `sinaPerfForecast` */
export interface SinaPerfForecastRecord extends SinaBaseRow {
  announceDate?: string
  reportPeriod?: string
  forecastType?: string
  summary?: string
  content?: string
  priorEps?: string
}

/** 股本结构 — `sinaStockStructure` */
export interface SinaStockStructureRecord extends SinaBaseRow {
  changeDate?: string
  announceDate?: string
  changeReason?: string
  totalShares?: string
  floatShares?: string
}

/** 公告列表 — `sinaAnnualBulletins` 等 */
export interface SinaBulletinRecord extends SinaBaseRow {
  date: string
  title: string
  pageType?: string
  link?: string
  id?: string
}

/** 公告全量分页列表 — `sinaAllBulletins` */
export interface SinaAllBulletinPageRecord {
  code: string
  page: number
  hasNext: boolean
  items: SinaBulletinRecord[]
  source: SinaSource
}

/** 公告详情 — `sinaBulletinDetail` */
export interface SinaBulletinDetailRecord extends SinaBaseRow {
  id: string
  title?: string
  link: string
  contentType: 'pdf' | 'html'
  pdfUrl?: string
  text: string
}

/** 内部交易 — `sinaInsiderTrades` */
export interface SinaInsiderTradeRecord extends SinaBaseRow {
  name?: string
  person?: string
  changeType?: string
  changeShares?: string
  avgPrice?: string
  changeAmount?: string
  sharesAfter?: string
  reason?: string
  changeDate?: string
  shareClass?: string
  relation?: string
  position?: string
}

/** 千股千评 — `sinaStockComment` */
export interface SinaStockCommentRecord extends SinaBaseRow {
  name?: string
  comment?: string
  price?: string
  change?: string
  changePct?: string
  prevClose?: string
  open?: string
}

/** 历史分价 / 持仓分析 — `sinaPriceHistory` */
export interface SinaPriceHistoryLevelRecord extends SinaBaseRow {
  price: string
  volume: string
  ratio: string
}

export interface SinaPriceHistoryRecord {
  code: string
  startDate?: string
  endDate?: string
  levels: SinaPriceHistoryLevelRecord[]
  source: SinaSource
}

/** ETF 场内行情 — `sinaEtfList` */
export interface SinaEtfListItemRecord extends SinaBaseRow {
  symbol?: string
  name?: string
  price?: string | number
  change?: string | number
  changePct?: string | number
  open?: string | number
  high?: string | number
  low?: string | number
  prevClose?: string | number
  volume?: string | number
  amount?: string | number
  turnoverRatio?: string | number
  tickTime?: string
  detailUrl?: string
}

export interface SinaEtfListPageRecord {
  node: string
  total: number
  page: number
  pageSize: number
  hasNext: boolean
  items: SinaEtfListItemRecord[]
  source: SinaSource
}

/** 基金行情快照 — `sinaFundQuote` */
export interface SinaFundQuoteRecord extends SinaBaseRow {
  name?: string
  unitNav?: number | null
  accNav?: number | null
  prevNav?: number | null
  changePct?: number | null
  navDate?: string
  exchangePrice?: number | null
  exchangeChange?: number | null
  exchangeChangePct?: number | null
  premiumPct?: number | null
  detailUrl?: string
}

/** 基金基本信息 — `sinaFundProfile` */
export interface SinaFundProfileRecord extends SinaBaseRow {
  fullName?: string
  shortName?: string
  establishDate?: string
  listDate?: string
  type1?: string
  type2?: string
  type3?: string
  fundScale?: string
  fundShares?: string
  manager?: string
  company?: string
  benchmark?: string
  fields?: Record<string, string>
  detailUrl?: string
}

/** 基金历史净值 — `sinaFundNav` */
export interface SinaFundNavRowRecord extends SinaBaseRow {
  date: string
  unitNav?: string
  accNav?: string
  dailyReturn?: string
  weeklyReturn?: string
}

/** 基金公告 — `sinaFundAnnouncements` */
export interface SinaFundAnnouncementRecord extends SinaBaseRow {
  id: string
  title: string
  type?: string
  publishDate?: string
  publisher?: string
  link: string
}

/** 基金现金分红 — `sinaFundDividends`（`FdFundService.getJJFHAll` · `fh`） */
export interface SinaFundDividendRecord extends SinaBaseRow {
  qydjr?: string
  sqhlmsf?: string
  hlffr_cw?: string
  hlffr_cn?: string
  cqcxr_cw?: string
  cqcxr_cn?: string
}

export interface SinaFundDividendsPageRecord {
  code: string
  dividends: SinaFundDividendRecord[]
  source: SinaSource
}

/** 基金十大持有人 — `sinaFundTopHolders`（`FundPageInfoService.tabsdcyr`） */
export interface SinaFundTopHolderRecord extends SinaBaseRow {
  name: string
  shares?: string
  ratioPct?: string
}

export interface SinaFundTopHoldersPageRecord {
  code: string
  reportDate?: string
  availableDates: string[]
  holders: SinaFundTopHolderRecord[]
  source: SinaSource
}

/** 基金持有人结构 — `sinaFundHolderStructure`（`FundPageInfoService.tabcyrjg`） */
export interface SinaFundHolderStructureRecord {
  code: string
  reportDate?: string
  availableDates: string[]
  structure: {
    reportDate?: string
    holderCount?: string
    totalShares?: string
    institutionalShares?: string
    institutionalRatioPct?: string
    individualShares?: string
    individualRatioPct?: string
    employeeShares?: string
    employeeRatioPct?: string
    managerShares?: string
    managerRatioPct?: string
  }
  source: SinaSource
}

/** 基金持有人结构历史 — `sinaFundHolderStructureHistory`（`FundPageInfoService.tabsdcyrbd`） */
export interface SinaFundHolderStructureHistoryRow extends SinaBaseRow {
  reportDate: string
  individualShares?: string
  institutionalShares?: string
  institutionalRatioPct?: string
}

export interface SinaFundHolderStructureHistoryRecord {
  code: string
  periods: SinaFundHolderStructureHistoryRow[]
  source: SinaSource
}

/** 基金财报单期指标 — `sinaFundFinancialIndicators` / `sinaFundIncomeStatement` / `sinaFundBalanceSheet` */
export interface SinaFundFinancialPeriodRecord {
  reportDate: string
  metrics: Record<string, string | number | null>
}

export interface SinaFundFinancialStatementRecord {
  code: string
  periods: SinaFundFinancialPeriodRecord[]
  source: SinaSource
}

/** 公司章程 — `sinaCorpRule` */
export interface SinaCorpRuleRecord extends SinaBaseRow {
  title?: string
  content?: string
}

/** 新股发行（IPO）— `sinaIpoInfo` */
export interface SinaIpoRecord extends SinaBaseRow {
  issuePrice?: string
  issuePe?: string
  issueMethod?: string
  listMarket?: string
  leadUnderwriter?: string
  totalSharesBefore?: string
  fields: Record<string, string>
}
