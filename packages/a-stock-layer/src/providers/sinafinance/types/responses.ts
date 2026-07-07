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
