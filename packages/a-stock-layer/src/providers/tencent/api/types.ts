/**
 * 腾讯 `proxy.finance.qq.com` / `gu.qq.com` 公开接口原始类型。
 *
 * 页面来源：`stockapp.finance.qq.com` 板块列表、`gu.qq.com/{code}/gp/*` 个股子页。
 * 采集验证：2026-07-07。
 */

/** 腾讯行情中心 Referer — proxy / 行情接口统一使用 */
export const TENCENT_REFERER = 'https://stockapp.finance.qq.com/'

/** @deprecated 使用 {@link TENCENT_REFERER} */
export const GU_QQ_REFERER = TENCENT_REFERER

/** proxy 根路径 */
export const TENCENT_PROXY_BASE = 'https://proxy.finance.qq.com'

/** 研报详情页 URL 前缀（需拼接 `id` 与 `&s=b`） */
export const TENCENT_REPORT_DETAIL_BASE =
  'https://gu.qq.com/resources/shy/news/detail-v2/index.html#/?id='

/**
 * 行情中心板块 `type` / 导航 id → `getBoardRankList` 的 `board_code`。
 *
 * @example cyb → 创业板；kcb / star → 科创板；hsj / aStock → 沪深京 A 股
 */
export const TENCENT_BOARD_CODE_MAP: Record<string, string> = {
  hsj: 'aStock',
  astock: 'aStock',
  cyb: 'cyb',
  gem: 'cyb',
  kcb: 'ksh',
  ksh: 'ksh',
  star: 'ksh',
}

/** `getBoardRankList` 支持的 `sort_type` 字段名 */
export type TencentBoardSortField =
  | 'code'
  | 'name'
  | 'price'
  | 'priceRatio'
  | 'priceChange'
  | 'exchange'
  | 'netMainIn'
  | 'volumeRatio'
  | 'amplitude'
  | 'volume'
  | 'turnover'

/** 腾讯 proxy 通用信封（多数 JSON 接口） */
export interface TencentProxyEnvelope<T> {
  code: number
  msg: string
  data: T
}

/** `getBoardRankList` 单条排行 */
export interface TencentBoardRankRow {
  /** 带市场前缀，如 sz300308 */
  code: string
  name: string
  /** 最新价（元，字符串） */
  zxj?: string
  /** 涨跌幅 % */
  zdf?: string
  /** 涨跌额 */
  zd?: string
  /** 换手率 % */
  hsl?: string
  /** 市盈率 TTM */
  pe_ttm?: string
  /** 市净率 */
  pn?: string
  /** 主力净流入（万元） */
  zljlr?: string
  stock_type?: string
  [key: string]: unknown
}

/** `getBoardRankList` 响应 data 块 */
export interface TencentBoardRankData {
  rank_list: TencentBoardRankRow[]
  total?: number
}

/**
 * 申万行业板块 `board_type` — 对应 mstats `#module=hy&type=first|second`。
 *
 * @see https://stockapp.finance.qq.com/mstats/#mod=list&id=hy_first&module=hy&type=first
 */
export type TencentIndustryBoardType = 'hy' | 'hy2'

/** `rank/pt/getRank` 行业列表支持的 `sort_type` */
export type TencentIndustrySortField =
  | 'code'
  | 'name'
  | 'price'
  | 'priceRatio'
  | 'priceRatioD5'
  | 'priceRatioD20'
  | 'priceRatioD60'
  | 'priceRatioW52'
  | 'priceRatioY'

/** `rank/pt/getRank` 领涨股 */
export interface TencentIndustryLeadingStock {
  code?: string
  name?: string
  zd?: string
  zdf?: string
  zxj?: string
}

/** `rank/pt/getRank` 单条申万行业 */
export interface TencentIndustryBoardRow {
  /** 行业板块代码，如 pt01801780 */
  code: string
  name: string
  zxj?: string
  zdf?: string
  zd?: string
  zdf_d5?: string
  zdf_d20?: string
  zdf_d60?: string
  zdf_w52?: string
  zdf_y?: string
  hsl?: string
  lb?: string
  turnover?: string
  volume?: string
  zljlr?: string
  zgb?: string
  stock_type?: string
  lzg?: TencentIndustryLeadingStock
  [key: string]: unknown
}

/** `rank/pt/getRank` 响应 data 块 */
export interface TencentIndustryBoardData {
  rank_list: TencentIndustryBoardRow[]
  total?: number
  offset?: number
}

/**
 * 全球股指分区 — 对应 mstats `#module=GIDX&type=ALL|EU|AM|AS|OA|AF`。
 *
 * @see https://stockapp.finance.qq.com/mstats/#mod=list&id=indices&module=GIDX&type=ALL
 */
export type TencentGlobalIndexRegionKey =
  | 'ALL'
  | 'EU'
  | 'AM'
  | 'AS'
  | 'OA'
  | 'AF'

/** `indexRankDetail2` 单条全球指数 */
export interface TencentGlobalIndexRankRow {
  code?: string
  qtcode?: string
  name?: string
  location?: string
  zxj?: string | number
  zdf?: string | number
  state?: string
  img?: string
  [key: string]: unknown
}

/** `indexRankDetail2` 响应 data — 按地区分组 */
export interface TencentGlobalIndexRankData {
  common?: TencentGlobalIndexRankRow[]
  america?: TencentGlobalIndexRankRow[]
  europe?: TencentGlobalIndexRankRow[]
  asia?: TencentGlobalIndexRankRow[]
  other?: TencentGlobalIndexRankRow[]
}

/**
 * 全球期货品类 — 对应 mstats `#module=GQH&type=ALL` 合并顺序。
 *
 * @see https://stockapp.finance.qq.com/mstats/#mod=list&id=qh_global&module=GQH&type=ALL
 */
export type TencentGlobalFuturesCategoryKey =
  | 'ALL'
  | 'agriculture'
  | 'basicMetal'
  | 'energy'
  | 'exchangeRate'
  | 'interestRate'
  | 'preciousMetal'
  | 'stockIndex'

/** `worldCommodities` 单条全球期货 */
export interface TencentGlobalFuturesRow {
  code?: string
  qtcode?: string
  name?: string
  location?: string
  zxj?: string | number
  zdf?: string | number
  zde?: string | number
  state?: string
  status?: string
  img?: string
  stocktype?: string
  [key: string]: unknown
}

/** `worldCommodities` 响应 data — 按品类分组 */
export interface TencentWorldCommoditiesData {
  agriculture?: TencentGlobalFuturesRow[]
  basicMetal?: TencentGlobalFuturesRow[]
  energy?: TencentGlobalFuturesRow[]
  exchangeRate?: TencentGlobalFuturesRow[]
  interestRate?: TencentGlobalFuturesRow[]
  preciousMetal?: TencentGlobalFuturesRow[]
  stockIndex?: TencentGlobalFuturesRow[]
}

/** `investRate/getReport` 单条研报 */
export interface TencentResearchReportRow {
  id: string
  title: string
  time?: string
  typeStr?: string
  type?: string
  symbol?: string
  /** 上游常为空，详情 URL 需由 {@link buildTencentReportDetailUrl} 拼接 */
  url?: string
  src?: string
  summary?: string
  symbols?: string[]
  tzpj?: string
}

/** `investRate/getReport` 分页 data */
export interface TencentResearchReportData {
  total_num?: number
  total_page?: number
  data: TencentResearchReportRow[]
}

/** `noticeList/search` 单条公告 */
export interface TencentNoticeRow {
  id: string
  symbol?: string
  title: string
  time?: string
  type?: string
  url?: string
  newstype?: string
}

/** `noticeList/search` 分页 data */
export interface TencentNoticeListData {
  total_num?: number
  total_page?: number
  data: TencentNoticeRow[]
  h5url?: string
}

/** `HyNews/getBySymbol` 单条行业/关联新闻 */
export interface TencentHyNewsRow {
  title: string
  url?: string
  pub_time?: string
}

/** `HyNews/getBySymbol` data */
export interface TencentHyNewsData {
  news: TencentHyNewsRow[]
}

/** `jiankuang` 主要指标块 */
export interface TencentJiankuangMetrics {
  date?: string
  detail?: Record<string, string>
}

/** `jiankuang` 公司简介块 */
export interface TencentJiankuangCompany {
  gsmz?: string
  yw?: string
  dy?: string
  jg?: string
  riqi?: string
  plate?: Array<{ name?: string; id?: string; level?: string }>
  concept?: Array<{ name?: string; id?: string; tag?: string }>
}

/** `jiankuang` 响应 data */
export interface TencentJiankuangData {
  zyzb?: TencentJiankuangMetrics
  gsjj?: TencentJiankuangCompany
}

/** `hsfundtab` 当日资金流 */
export interface TencentTodayFundFlow {
  stockCode?: string
  mainNetIn?: string
  mainIn?: string
  mainOut?: string
  retailIn?: string
  retailOut?: string
  superFlow?: string
  bigFlow?: string
  normalFlow?: string
  smallFlow?: string
  summary?: Record<string, unknown>
}

/** `hsfundtab` 五日 / 历史资金流条目 */
export interface TencentFundFlowDayRow {
  date?: string
  mainNetIn?: string
  price?: string
  avgIn?: string
}

/** `hsfundtab` 响应 data（按请求的 type 块返回） */
export interface TencentFundFlowData {
  todayFundFlow?: TencentTodayFundFlow
  fiveDayFundFlow?: {
    fiveDayMainNetIn?: string
    DayMainNetInList?: TencentFundFlowDayRow[]
  }
  todayFundTrend?: {
    minList?: Array<{ time?: string; mainNetIn?: string }>
  }
  historyFundFlow?: {
    oneDayKlineList?: TencentFundFlowDayRow[]
  }
}

/** `kline/app/get` 单根 K 线 */
export interface TencentKlineNode {
  open?: string
  last?: string
  high?: string
  low?: string
  volume?: string
  amount?: string
  exchange?: string
  date?: string
}

/** `kline/app/get` data */
export interface TencentKlineAppData {
  stockCode?: string
  nodes?: TencentKlineNode[]
}

/** `plateNew` 标签项 */
export interface TencentPlateTag {
  id?: string
  name?: string
  tag?: string
  zdf?: string
}

/** `plateNew` data */
export interface TencentPlateNewData {
  plate?: TencentPlateTag[]
  concept?: TencentPlateTag[]
  area?: TencentPlateTag[]
}

/** 关联板块 `relate/data/plate` 条目 */
export interface TencentRelatedPlateRow {
  code?: string
  name?: string
}

/** `getInvestRate` 评级统计 */
export interface TencentInvestRateData {
  pjtj?: Record<string, { name?: string; num?: number }>
  report?: { state?: number; info?: TencentResearchReportRow[] }
}

/** `jggd/get` 机构观点 */
export interface TencentJggdData {
  mbjj?: string
  zgjg?: string
  zdjg?: string
  pjtj1?: Record<string, unknown>
  pjtj2?: Record<string, unknown>
  pjtj3?: Record<string, unknown>
}

/** `getDadan` 大单明细行：`[时间, 价格, 成交量, B|S|M]` */
export type TencentBigOrderRow = [string, string, string, string]

/** `getDadan` data */
export interface TencentBigOrderData {
  summary?: {
    date?: string
    time?: string
    data?: Record<string, string>
    desc?: string
    volume?: string
  }
  detail?: TencentBigOrderRow[]
}

/** `getMingxiV2` 成交明细 */
export interface TencentTradeDetailData {
  date?: string
  data?: string[][]
}

/** `smartbox/search` 股票命中 */
export interface TencentSmartboxStock {
  code?: string
  name?: string
  type?: string
  suggest?: string
}

/** `sqt.gtimg.cn` UTF-8 JSON 行情数组（下标与 `qt` 文本协议一致） */
export type TencentSqtQuoteArray = string[]
