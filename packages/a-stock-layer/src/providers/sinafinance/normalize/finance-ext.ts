import type { Dividend, DragonTiger, FinancialSummary } from '../../../core/schema.js'
import { normalizeCode, safeFloat } from '../../../utils/helpers.js'
import type { SinaPerfForecastRecord, SinaIpoRecord } from '../types/responses.js'
import { SINA_SOURCE } from '../types/responses.js'
import type {
  SinaBillDetailRow,
  SinaBlockTradeRow,
  SinaBulletinRow,
  SinaDividendRow,
  SinaDragonTigerRow,
  SinaMarginTradingRow,
  SinaPivotFinancialTable,
  SinaPriceLevelRow,
  SinaShareUnlockRow,
  SinaStockStructureRow,
} from '../api/types.js'

function parseWanAmount(raw?: string): number | null {
  if (!raw) return null
  const cleaned = raw.replace(/,/g, '').replace(/[^\d.-]/g, '')
  const n = safeFloat(cleaned)
  if (n == null) return null
  if (raw.includes('万')) return n * 10_000
  return n
}

function metricValue(table: SinaPivotFinancialTable, names: string[], periodIdx: number): string | undefined {
  for (const name of names) {
    const row = Object.entries(table.metrics).find(([k]) => k.includes(name))
    if (row?.[1]?.[periodIdx]) return row[1][periodIdx]
  }
  return undefined
}

export function mapSinaDividends(code: string, rows: SinaDividendRow[]): Dividend[] {
  const bare = normalizeCode(code)
  return rows.map(row => {
    const cash = safeFloat(row.cashBonus)
    const stock = safeFloat(row.stockBonus)
    const transfer = safeFloat(row.transferBonus)
    const stockBonus = stock != null || transfer != null
      ? (stock ?? 0) + (transfer ?? 0)
      : null
    return {
      code: bare,
      year: row.announceDate?.slice(0, 4),
      cashBonus: cash,
      stockBonus,
      exDate: row.exDate,
      recordDate: row.recordDate,
      progress: row.progress,
      plan: cash != null ? `10派${cash}元` : undefined,
    }
  })
}

export function mapSinaFinancialPivot(
  code: string,
  guide: SinaPivotFinancialTable | null,
  profit: SinaPivotFinancialTable | null,
): FinancialSummary[] {
  const bare = normalizeCode(code)
  const periods = guide?.periods?.length
    ? guide.periods
    : profit?.periods ?? []
  if (!periods.length) return []

  return periods.map((period, idx) => {
    const revenue = safeFloat(metricValue(profit ?? guide!, ['营业收入', '营业总收入'], idx)?.replace(/,/g, ''))
    const netProfit = safeFloat(metricValue(profit ?? guide!, ['净利润', '归属于母公司'], idx)?.replace(/,/g, ''))
    const eps = safeFloat(metricValue(guide ?? profit!, ['每股收益', '摊薄每股收益'], idx))
    const roe = safeFloat(metricValue(guide ?? profit!, ['净资产收益率'], idx))
    const grossMargin = safeFloat(metricValue(guide ?? profit!, ['毛利率'], idx))
    const netMargin = safeFloat(metricValue(guide ?? profit!, ['净利润率', '销售净利率'], idx))
    const debtRatio = safeFloat(metricValue(guide ?? profit!, ['资产负债率'], idx))
    const operatingCashFlow = safeFloat(metricValue(guide ?? profit!, ['每股经营性现金流'], idx))
    const bps = safeFloat(metricValue(guide ?? profit!, ['每股净资产'], idx))
    return {
      code: bare,
      reportDate: period,
      reportType: 'quarter',
      revenue,
      revenueYoy: null,
      netProfit,
      netProfitYoy: null,
      eps,
      roe,
      grossMargin,
      netMargin,
      debtRatio,
      operatingCashFlow,
      bps,
    }
  })
}

export function mapSinaDragonTigerRows(rows: SinaDragonTigerRow[]): DragonTiger[] {
  return rows.map(row => ({
    code: normalizeCode(row.code),
    name: row.name,
    date: row.tradeDate,
    reason: row.reason,
    changePct: safeFloat(row.changePct),
    buyAmount: parseWanAmount(row.amount),
    sellAmount: null,
    netAmount: null,
  }))
}

export function mapSinaBlockTrades(code: string, rows: SinaBlockTradeRow[]): Record<string, unknown>[] {
  const bare = normalizeCode(code)
  return rows.map(row => ({
    code: bare,
    tradeDate: row.tradeDate,
    name: row.name,
    price: safeFloat(row.price?.replace(/,/g, '')),
    volume: safeFloat(row.volume?.replace(/,/g, '')),
    amount: safeFloat(row.amount?.replace(/,/g, '')),
    buyer: row.buyer,
    seller: row.seller,
    source: SINA_SOURCE,
  }))
}

export function mapSinaShareUnlock(code: string, rows: SinaShareUnlockRow[]): Record<string, unknown>[] {
  const bare = normalizeCode(code)
  return rows.map(row => ({
    code: bare,
    name: row.name,
    unlockDate: row.unlockDate,
    unlockShares: row.unlockShares,
    unlockMarketValue: row.unlockMarketValue,
    batch: row.batch,
    announceDate: row.announceDate,
    source: SINA_SOURCE,
  }))
}

export function mapSinaMarginTrading(row: SinaMarginTradingRow | null): Record<string, unknown>[] {
  if (!row) return []
  return [{
    code: normalizeCode(row.code),
    name: row.name,
    marginBalance: row.marginBalance,
    marginBuy: row.marginBuy,
    marginRepay: row.marginRepay,
    shortBalance: row.shortBalance,
    shortVolume: row.shortVolume,
    shortSell: row.shortSell,
    shortRepay: row.shortRepay,
    source: SINA_SOURCE,
  }]
}

export function mapSinaPriceDistribution(
  code: string,
  rows: SinaPriceLevelRow[],
): Record<string, unknown>[] {
  const bare = normalizeCode(code)
  return rows.map(row => ({
    code: bare,
    price: safeFloat(row.price),
    volume: safeFloat(row.volume),
    ratio: row.ratio,
    source: SINA_SOURCE,
  }))
}

export function mapSinaBillDetails(
  code: string,
  rows: SinaBillDetailRow[],
): Record<string, unknown>[] {
  const bare = normalizeCode(code)
  return rows.map(row => ({
    code: bare,
    time: row.time,
    volume: safeFloat(row.volume),
    price: safeFloat(row.price),
    direction: row.direction,
    source: SINA_SOURCE,
  }))
}

export function mapSinaStockStructure(
  code: string,
  rows: SinaStockStructureRow[],
): Record<string, unknown>[] {
  const bare = normalizeCode(code)
  return rows.map(row => ({
    code: bare,
    changeDate: row.changeDate,
    announceDate: row.announceDate,
    changeReason: row.changeReason,
    totalShares: row.totalShares,
    floatShares: row.floatShares,
    source: SINA_SOURCE,
  }))
}

export function mapSinaBulletins(
  code: string,
  rows: SinaBulletinRow[],
): Record<string, unknown>[] {
  const bare = normalizeCode(code)
  return rows.map(row => ({
    code: bare,
    date: row.date,
    title: row.title,
    pageType: row.pageType,
    source: SINA_SOURCE,
  }))
}

export function mapSinaCirculateShareholders(
  code: string,
  meta: { asOfDate?: string; announceDate?: string; holderCount?: string },
  rows: { rank: number; name: string; shares?: string; ratio?: string; shareType?: string }[],
): Record<string, unknown>[] {
  const bare = normalizeCode(code)
  const header = {
    code: bare,
    asOfDate: meta.asOfDate,
    announceDate: meta.announceDate,
    holderCount: meta.holderCount,
    type: 'meta',
    holderCategory: 'float',
    source: SINA_SOURCE,
  }
  const items = rows.map(row => ({
    code: bare,
    rank: row.rank,
    name: row.name,
    shares: row.shares,
    ratio: row.ratio,
    shareType: row.shareType,
    asOfDate: meta.asOfDate,
    type: 'holder',
    holderCategory: 'float',
    source: SINA_SOURCE,
  }))
  return items.length ? [header, ...items] : []
}

export function mapSinaPerfForecast(
  code: string,
  rows: Array<{
    announceDate?: string
    reportPeriod?: string
    forecastType?: string
    summary?: string
    content?: string
    priorEps?: string
  }>,
): SinaPerfForecastRecord[] {
  const bare = normalizeCode(code)
  return rows.map(row => ({
    code: bare,
    source: SINA_SOURCE,
    announceDate: row.announceDate,
    reportPeriod: row.reportPeriod,
    forecastType: row.forecastType,
    summary: row.summary,
    content: row.content,
    priorEps: row.priorEps,
  }))
}

export function mapSinaIpoInfo(
  code: string,
  fields: Record<string, string>,
): SinaIpoRecord {
  const bare = normalizeCode(code)
  return {
    code: bare,
    source: SINA_SOURCE,
    issuePrice: fields['发行价(元)'] ?? fields['发行价'],
    issuePe: fields['发行市盈率（按发行后总股本）'] ?? fields['发行市盈率'],
    issueMethod: fields['发行方式'],
    listMarket: fields['上市地'],
    leadUnderwriter: fields['主承销商'],
    totalSharesBefore: fields['首发前总股本（万股）'],
    fields,
  }
}

export function mapSinaFinancialPivotToStatements(
  code: string,
  pivot: { periods: string[]; metrics: Record<string, string[]> } | null,
  statement: 'income' | 'balance' | 'cashflow' | 'dupont',
): Record<string, unknown>[] {
  if (!pivot?.periods?.length) return []
  const bare = normalizeCode(code)
  return pivot.periods.map((period, idx) => {
    const metrics: Record<string, string> = {}
    for (const [name, values] of Object.entries(pivot.metrics)) {
      if (values[idx] != null) metrics[name] = values[idx]!
    }
    return {
      code: bare,
      reportDate: period,
      statement,
      metrics,
      source: SINA_SOURCE,
    }
  })
}
