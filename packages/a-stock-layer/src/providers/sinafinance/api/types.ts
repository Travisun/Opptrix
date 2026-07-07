/**
 * 新浪财经公开接口原始类型。
 *
 * 页面来源：`finance.sina.com.cn/realstock/company/{symbol}/nc.shtml`
 * 采集验证：2026-07-07。
 */

/** 新浪财经根 Referer — 须为 `http://finance.sina.com.cn`（https 或 vip 子域易被拒） */
export const SINA_REFERER = 'http://finance.sina.com.cn/'

/** 个股行情页 Referer 前缀（http） */
export const SINA_STOCK_PAGE_BASE = 'http://finance.sina.com.cn/realstock/company/'

/**
 * 构建个股页 Referer（公告、资金流、分价/大单等推荐）。
 * @param symbol - 如 `sh600905`
 */
export function buildSinaStockReferer(symbol: string): string {
  const key = String(symbol ?? '').trim().toLowerCase()
  if (!key) return SINA_REFERER
  return `${SINA_STOCK_PAGE_BASE}${key}/nc.shtml`
}

/** F10 公司资料页 URL 前缀（仅用于拼接链接，HTTP Referer 统一用 {@link SINA_REFERER}） */
export const SINA_CORP_PAGE_BASE = 'https://vip.stock.finance.sina.com.cn/corp/go.php/vCI_CorpInfo/stockid/'

/** 请求 F10 / 数据中心 HTML 时使用的 Referer（固定主站） */
export function buildSinaCorpReferer(_stockId?: string): string {
  return SINA_REFERER
}

/** `Market_Center.getHQNodeData` 的 `node` 映射 */
export const SINA_BOARD_NODE_MAP: Record<string, string> = {
  all: 'hs_a',
  hs_a: 'hs_a',
  a: 'hs_a',
  astock: 'hs_a',
  cyb: 'cyb',
  gem: 'cyb',
  kcb: 'kcb',
  star: 'kcb',
  ksh: 'kcb',
  b: 'hs_b',
  hs_b: 'hs_b',
}

/** K 线 `scale` 参数 */
export const SINA_KLINE_SCALE: Record<string, string> = {
  '5min': '5',
  '15min': '15',
  '30min': '30',
  '60min': '60',
  daily: '240',
  weekly: '1200',
  monthly: '7200',
}

/** `stocknews.../get4pc` 单条 */
export interface SinaStockNewsRow {
  title?: string
  url?: string
  ctime?: number
  ctime_str?: string
}

export interface SinaStockNewsEnvelope {
  result?: {
    status?: { code?: number; msg?: string }
    data?: SinaStockNewsRow[]
  }
}

/** 公告 `CB_AllService.getMemordlistbysymbol` */
export interface SinaNoticeRow {
  title?: string
  date?: string
  id?: string
}

export interface SinaNoticeEnvelope {
  result?: {
    status?: { code?: number; msg?: string }
    data?: SinaNoticeRow[]
  }
}

/** `MoneyFlow.ssi_ssfx_flzjtj` */
export interface SinaMoneyFlowSnapshot {
  name?: string
  trade?: string
  changeratio?: string
  volume?: string
  turnover?: string
  netamount?: string
  r0x_ratio?: string
  r0_in?: string
  r0_out?: string
  r1_in?: string
  r1_out?: string
  r2_in?: string
  r2_out?: string
  r3_in?: string
  r3_out?: string
  opendate?: string
  ticktime?: string
  curr_capital?: string
}

/** 分时 `getMinlineData` */
export interface SinaMinlineRow {
  m?: string
  p?: string
  v?: string
  avg_p?: string
  tot_v?: string
}

export interface SinaMinlineEnvelope {
  result?: {
    status?: { code?: number; msg?: string }
    data?: SinaMinlineRow[]
  }
}

/** `Market_Center.getHQNodeData` 排行行 */
export interface SinaMarketRankRow {
  symbol?: string
  code?: string
  name?: string
  trade?: string
  pricechange?: string | number
  changepercent?: string | number
  volume?: string | number
  amount?: string | number
  per?: string | number
  pb?: string | number
  mktcap?: string | number
  turnoverratio?: string | number
}

/** F10 公司简介原始字段（HTML 标签 → 值） */
export type SinaCorpInfoRaw = Record<string, string | undefined> & {
  orgProfile?: string
}

export interface SinaExecutiveRow {
  name: string
  title?: string
  startDate?: string
  endDate?: string
}

export interface SinaShareholderMeta {
  asOfDate?: string
  announceDate?: string
  holderCount?: string
}

export interface SinaShareholderRow {
  rank: number
  name: string
  shares?: string
  ratio?: string
  shareType?: string
}

export interface SinaFundHoldingBlock {
  asOfDate?: string
  fundName: string
  fundCode: string
  shares?: string
  floatPct?: string
  marketValue?: string
  navPct?: string
}

export interface SinaConceptPlateRow {
  name: string
  node?: string
  marketUrl?: string
}

export interface SinaRelatedSecurityRow {
  code: string
  name: string
  type?: string
}

export interface SinaIndexMembershipRow {
  indexName: string
  indexCode?: string
  enterDate?: string
  exitDate?: string
}

/** 分红送配 `vISSUE_ShareBonus` */
export interface SinaDividendRow {
  announceDate: string
  stockBonus?: string
  transferBonus?: string
  cashBonus?: string
  progress?: string
  exDate?: string
  recordDate?: string
  listingDate?: string
}

/** 限售解禁 `kind/xsjj` */
export interface SinaShareUnlockRow {
  code: string
  name: string
  unlockDate: string
  unlockShares?: string
  unlockMarketValue?: string
  batch?: string
  announceDate?: string
}

/** 大宗交易 `kind/dzjy` */
export interface SinaBlockTradeRow {
  tradeDate: string
  code: string
  name: string
  price?: string
  volume?: string
  amount?: string
  buyer?: string
  seller?: string
}

/** 龙虎榜 `kind/lhb` */
export interface SinaDragonTigerRow {
  code: string
  name: string
  tradeDate: string
  reason?: string
  close?: string
  changePct?: string
  volume?: string
  amount?: string
}

/** 融资融券个股行（自 rzrq 全市场页筛选） */
export interface SinaMarginTradingRow {
  code: string
  name: string
  marginBalance?: string
  marginBuy?: string
  marginRepay?: string
  shortBalance?: string
  shortVolume?: string
  shortSell?: string
  shortRepay?: string
}

/** 分价 / 大单 */
export interface SinaPriceLevelRow {
  price: string
  volume: string
  ratio: string
}

export interface SinaBillDetailRow {
  time: string
  volume: string
  price: string
  direction: string
}

/** 财务透视表（报告期 × 指标） */
export interface SinaPivotFinancialTable {
  periods: string[]
  metrics: Record<string, string[]>
}

/** 股本结构历史 */
export interface SinaStockStructureRow {
  changeDate?: string
  announceDate?: string
  changeReason?: string
  totalShares?: string
  floatShares?: string
}

/** 公告列表项 */
export interface SinaBulletinRow {
  date: string
  title: string
  pageType?: string
}
