import type { StockKline, StockListItem, StockProfile } from '../../core/schema.js'
import { isCnEtfCode } from '../../core/instrument.js'
import { normalizeCode } from '../../utils/helpers.js'

/** 从全市场列表中筛出 A 股 ETF */
export function filterCnEtfListItems(items: StockListItem[]): StockListItem[] {
  return items.filter(item => isCnEtfCode(item.code))
}

/** 用日 K 收盘价近似 ETF 净值（免费源无 IOPV 时的回退） */
export function mapKlinesToEtfNavRows(code: string, klines: StockKline[]): Record<string, unknown>[] {
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

/** 将个股 profile 转为 ETF 概况行 */
export function mapProfilesToEtfProfileRows(profiles: StockProfile[]): Record<string, unknown>[] {
  return profiles.map(p => ({
    code: p.code,
    name: p.name ?? '',
    industry: p.industry ?? 'ETF',
    listingDate: p.listingDate,
    mainBusiness: p.mainBusiness,
    orgProfile: p.orgProfile,
    totalMarketCap: p.totalMarketCap ?? null,
    circulatingMarketCap: p.circulatingMarketCap ?? null,
  }))
}

export const CN_ETF_FREE_CAPABILITIES = [
  'etf_list',
  'etf_profile',
  'etf_nav',
] as const
