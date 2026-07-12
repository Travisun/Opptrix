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
import { normalizeCode, resolveMarket, safeFloat } from '../../utils/helpers.js'

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

/** 新浪 ETF 列表页 → StockListItem */
export function mapSinaEtfListItems(
  items: Array<{ code?: string; name?: string }>,
): StockListItem[] {
  return items
    .map(item => {
      const code = normalizeCode(String(item.code ?? ''))
      if (!isCnEtfCode(code)) return null
      return {
        code,
        name: String(item.name ?? ''),
        industry: 'ETF',
        market: resolveMarket(code),
      }
    })
    .filter(Boolean) as StockListItem[]
}

/** 新浪基金概况 + 可选行情快照 → 标准 etfProfile 行 */
export function mapSinaFundToEtfProfileRow(
  code: string,
  profile: Record<string, unknown> | null,
  quote?: Record<string, unknown> | null,
): StandardEtfProfileRow | null {
  if (!profile && !quote) return null
  const c = normalizeCode(code)
  const fields = (profile?.fields ?? {}) as Record<string, string>
  const fundType = [
    profile?.type1,
    profile?.type2,
    profile?.type3,
    fields.jjlx,
    fields.ejfl,
  ].map(v => String(v ?? '').trim()).filter(Boolean).join(' / ') || 'ETF'

  const scaleRaw = profile?.fundScale ?? fields.jjgm
  const sharesRaw = profile?.fundShares ?? fields.jjfe

  return {
    code: c,
    name: String(profile?.shortName ?? profile?.fullName ?? quote?.name ?? ''),
    fundType,
    industry: fundType,
    trackingIndex: String(profile?.benchmark ?? fields.gzzs ?? fields.jz ?? '').trim() || undefined,
    manager: String(profile?.manager ?? fields.jjjl ?? '').trim() || undefined,
    company: profile?.company != null ? String(profile.company) : undefined,
    benchmark: profile?.benchmark != null ? String(profile.benchmark) : undefined,
    listingDate: String(profile?.listDate ?? profile?.establishDate ?? '').slice(0, 10) || undefined,
    scale: parseScaleYi(scaleRaw),
    totalShares: safeFloat(sharesRaw),
    nav: safeFloat(quote?.unitNav),
    premiumRate: safeFloat(quote?.premiumPct),
    expenseRatio: safeFloat(fields.glf),
    source: String(profile?.source ?? quote?.source ?? 'sinafinance'),
  }
}

/** 新浪历史净值 → 标准 etfNav 行 */
export function mapSinaFundNavRows(
  code: string,
  rows: Array<Record<string, unknown>>,
  latestPremiumRate?: number | null,
): StandardEtfNavRow[] {
  const c = normalizeCode(code)
  return rows.map((row, i) => ({
    code: c,
    date: String(row.date ?? '').slice(0, 10),
    nav: safeFloat(row.unitNav),
    accNav: safeFloat(row.accNav),
    changePct: safeFloat(row.dailyReturn),
    premiumRate: i === 0 ? (latestPremiumRate ?? null) : null,
    source: String(row.source ?? 'sinafinance'),
  })).filter(r => r.date)
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

function parseScaleYi(raw: unknown): number | null {
  const text = String(raw ?? '').trim()
  if (!text || text === '--') return null
  const n = safeFloat(text.replace(/[,，]/g, ''))
  if (n == null) return null
  if (text.includes('亿')) return n
  if (text.includes('万')) return n / 10000
  if (n > 1e8) return n / 1e8
  return n
}
