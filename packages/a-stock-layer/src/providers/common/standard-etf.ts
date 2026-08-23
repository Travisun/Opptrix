/**
 * CN ETF 标准方法层 — 各 Provider 归一化至 Engine / market-data 同步可消费的行结构。
 *
 * 上层契约（client-ui EtfProfileData / sync engine）：
 * - etfList     → StockListItem[]
 * - etfProfile  → { code, name, fundType, trackingIndex, manager, scale, nav, premiumRate, ... }
 * - etfNav      → { code, date, nav, accNav, changePct, premiumRate }
 * - etfHoldings → { reportDate, holdingSymbol, holdingName, weight, shares?, marketValue? }
 */
import type { StockKline, StockListItem, StockProfile } from '../../core/schema.js'
import { isCnEtfCode } from '../../core/instrument.js'
import { normalizeCode, safeFloat } from '../../utils/helpers.js'

export type StandardEtfProfileRow = Record<string, unknown> & {
  code: string
  name?: string
  fundType?: string
  trackingIndex?: string
  manager?: string
  expenseRatio?: number | null
  scale?: number | null
  totalShares?: number | null
  nav?: number | null
  premiumRate?: number | null
  listingDate?: string
  benchmark?: string
  source?: string
}

export type StandardEtfNavRow = Record<string, unknown> & {
  code: string
  date: string
  nav?: number | null
  accNav?: number | null
  changePct?: number | null
  premiumRate?: number | null
  source?: string
}

export type StandardEtfHoldingRow = Record<string, unknown> & {
  reportDate: string
  holdingSymbol: string
  holdingName?: string | null
  weight?: number | null
  shares?: number | null
  marketValue?: number | null
  source?: string
}

/** 从全市场列表中筛出 A 股 ETF */
export function filterCnEtfListItems(items: StockListItem[]): StockListItem[] {
  return items.filter(item => isCnEtfCode(item.code))
}

/** 用日 K 收盘价近似 ETF 净值（免费源无 IOPV 时的回退） */
export function mapKlinesToEtfNavRows(code: string, klines: StockKline[]): StandardEtfNavRow[] {
  const c = normalizeCode(code)
  return klines.map(bar => ({
    code: c,
    date: bar.date,
    nav: bar.close,
    accNav: bar.close,
    changePct: bar.changePct,
    premiumRate: null,
    source: 'kline_proxy',
  }))
}

/** 将个股 profile 转为 ETF 概况行（免费源回退） */
export function mapProfilesToEtfProfileRows(profiles: StockProfile[]): StandardEtfProfileRow[] {
  return profiles.map(p => ({
    code: p.code,
    name: p.name ?? '',
    fundType: p.industry ?? 'ETF',
    industry: p.industry ?? 'ETF',
    listingDate: p.listingDate,
    mainBusiness: p.mainBusiness,
    orgProfile: p.orgProfile,
    scale: p.totalMarketCap ?? null,
    totalMarketCap: p.totalMarketCap ?? null,
    circulatingMarketCap: p.circulatingMarketCap ?? null,
  }))
}

/** 指数成分代理 → 标准 etfHoldings 行（宽基 ETF 回退） */
export function mapIndexConstToStandardEtfHoldings(
  etfCode: string,
  indexCode: string,
  constituents: Record<string, unknown>[],
  reportDate = '',
): StandardEtfHoldingRow[] {
  const date = reportDate || new Date().toISOString().slice(0, 10)
  return constituents.map(row => ({
    reportDate: String(row.updateDate ?? row.date ?? date).slice(0, 10),
    holdingSymbol: normalizeCode(String(row.stockCode ?? row.code ?? '')),
    holdingName: String(row.stockName ?? row.name ?? '') || null,
    weight: safeFloat(row.weight),
    shares: safeFloat(row.shares),
    marketValue: safeFloat(row.marketValue ?? row.market_value),
    source: 'index_constituent_proxy',
    indexCode: normalizeCode(indexCode),
    etfCode: normalizeCode(etfCode),
  })).filter(r => r.holdingSymbol)
}

