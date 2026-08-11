import type { StockKline, StockListItem } from '../../../core/schema.js'
import { isCnEtfCode } from '../../../core/instrument.js'
import { normalizeCode, resolveMarket, safeFloat } from '../../../utils/helpers.js'
import { fromThsCode } from '../api/symbols.js'
import type {
  StandardEtfHoldingRow,
  StandardEtfNavRow,
  StandardEtfProfileRow,
} from '../../common/standard-etf.js'
import { mapSnapshotToStockRealtime } from './index.js'

export const FUYAO_EXCHANGE_FUND_TYPE = 'exchange' as const

function msToYmd(ms: unknown): string {
  const n = Number(ms)
  if (!Number.isFinite(n) || n <= 0) return ''
  const d = new Date(n)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** 折溢价率 — 与 sinafinance 一致，百分数原值 */
export function computeEtfPremiumRate(
  lastPrice: number | null | undefined,
  unitNav: number | null | undefined,
): number | null {
  const price = safeFloat(lastPrice)
  const nav = safeFloat(unitNav)
  if (price == null || nav == null || nav <= 0) return null
  return ((price - nav) / nav) * 100
}

export function pickFundHolderRow(items: Record<string, unknown>[]): Record<string, unknown> | null {
  if (!items.length) return null
  const latest = (scope: string) => items
    .filter(i => String(i.merge_scope ?? '') === scope)
    .sort((a, b) => Number(b.report_date_ms) - Number(a.report_date_ms))[0]
  return latest('separate') ?? latest('merged') ?? items[0] ?? null
}

export function mapFundHoldersToProfileFields(
  items: Record<string, unknown>[],
): {
  holderAmount?: number | null
  avgHolderShare?: number | null
  instHolderRatio?: number | null
  indivHolderRatio?: number | null
  holderReportDate?: string
} | undefined {
  const row = pickFundHolderRow(items)
  if (!row) return undefined
  const fields = {
    holderAmount: safeFloat(row.holder_amount),
    avgHolderShare: safeFloat(row.avg_holder_share),
    instHolderRatio: safeFloat(row.ins_position),
    indivHolderRatio: safeFloat(row.psnl_rate),
    holderReportDate: msToYmd(row.report_date_ms) || undefined,
  }
  const hasValue = fields.holderAmount != null
    || fields.avgHolderShare != null
    || fields.instHolderRatio != null
    || fields.indivHolderRatio != null
  return hasValue ? fields : undefined
}

export function mapFundReturnsToPerformance(
  row: Record<string, unknown> | null | undefined,
): Record<string, number | null> | undefined {
  if (!row || typeof row !== 'object') return undefined
  const perf = {
    w4: safeFloat(row.return_month),
    w13: safeFloat(row.return_tmonth),
    w26: safeFloat(row.return_hyear),
    w52: safeFloat(row.return_year),
    year: safeFloat(row.return_nowyear),
    total: safeFloat(row.return_now),
    year3: safeFloat(row.return_tyear),
  }
  const hasValue = Object.values(perf).some(v => v != null)
  return hasValue ? perf : undefined
}

export function mapFundProfileToEtfProfileRow(
  code: string,
  profile: Record<string, unknown>,
  opts?: {
    nav?: number | null
    premiumRate?: number | null
    returns?: Record<string, unknown> | null
    name?: string
    holders?: ReturnType<typeof mapFundHoldersToProfileFields>
  },
): StandardEtfProfileRow {
  const c = normalizeCode(code)
  const estab = msToYmd(profile.estab_date)
  const performance = mapFundReturnsToPerformance(opts?.returns ?? null)
  return {
    code: c,
    name: opts?.name ?? String(profile.fund_name ?? ''),
    fundType: 'ETF',
    manager: String(profile.manager_name ?? '').trim() || undefined,
    company: String(profile.mgmt_name ?? '').trim() || undefined,
    listingDate: estab || undefined,
    establishDate: estab || undefined,
    nav: opts?.nav ?? null,
    premiumRate: opts?.premiumRate ?? null,
    performance,
    ...opts?.holders,
    source: 'tonghuashun',
  }
}

export function mapFundNavRows(
  code: string,
  items: Record<string, unknown>[],
  latestPremiumRate?: number | null,
): StandardEtfNavRow[] {
  const c = normalizeCode(code)
  const sorted = [...items].sort((a, b) => Number(a.nav_date) - Number(b.nav_date))
  return sorted.map((row, i) => {
    const nav = safeFloat(row.unit_nav)
    const accNav = safeFloat(row.adj_nav)
    const prevNav = i > 0 ? safeFloat(sorted[i - 1]?.unit_nav) : null
    const changePct = nav != null && prevNav != null && prevNav > 0
      ? ((nav - prevNav) / prevNav) * 100
      : null
    return {
      code: c,
      date: msToYmd(row.nav_date),
      nav,
      accNav: accNav ?? nav,
      changePct,
      premiumRate: i === sorted.length - 1 ? (latestPremiumRate ?? null) : null,
      source: 'tonghuashun',
    }
  }).filter(r => r.date)
}

export function mapFundHoldingsToEtfRows(
  etfCode: string,
  items: Record<string, unknown>[],
  reportDate = '',
): StandardEtfHoldingRow[] {
  const date = reportDate || new Date().toISOString().slice(0, 10)
  return items.map(row => ({
    reportDate: date,
    holdingSymbol: fromThsCode(String(row.ticker ?? row.thscode ?? '')),
    holdingName: String(row.stock_name ?? '').trim() || null,
    weight: safeFloat(row.hold_ratio),
    source: 'tonghuashun',
    etfCode: normalizeCode(etfCode),
  })).filter(r => r.holdingSymbol)
}

/** 场内 ETF 行情快照 — 字段语义对齐 mapSnapshotToStockRealtime */
export function mapFundMarketSnapshotToStockRealtime(
  snap: Record<string, unknown>,
  name = '',
): ReturnType<typeof mapSnapshotToStockRealtime> {
  return {
    ...mapSnapshotToStockRealtime(snap, name),
    turnoverRate: safeFloat(snap.turnover_ratio_pct),
  }
}

export function mapFundHistoricalBarToKline(
  code: string,
  bar: Record<string, unknown>,
  prevClose?: number | null,
): StockKline {
  const close = safeFloat(bar.close_price)
  const changePct = prevClose != null && close != null && prevClose > 0
    ? ((close - prevClose) / prevClose) * 100
    : null
  return {
    code: normalizeCode(code),
    date: msToYmd(bar.date_ms),
    open: safeFloat(bar.open_price) ?? 0,
    close: close ?? 0,
    high: safeFloat(bar.high_price) ?? 0,
    low: safeFloat(bar.low_price) ?? 0,
    volume: safeFloat(bar.volume) ?? 0,
    amount: safeFloat(bar.turnover) ?? 0,
    changePct,
    turnoverRate: null,
  }
}

export function mapFundHistoricalBarsToKlines(
  code: string,
  bars: Record<string, unknown>[],
): StockKline[] {
  const sorted = [...bars].sort((a, b) => Number(a.date_ms) - Number(b.date_ms))
  let prevClose: number | null = null
  return sorted.map(bar => {
    const row = mapFundHistoricalBarToKline(code, bar, prevClose)
    prevClose = row.close
    return row
  }).filter(r => r.date)
}

export function mapFundTickerToListItem(row: Record<string, unknown>): StockListItem | null {
  const code = fromThsCode(String(row.thscode ?? row.ticker ?? ''))
  if (!isCnEtfCode(code)) return null
  return {
    code,
    name: String(row.name ?? ''),
    industry: 'ETF',
    market: String(row.exchange ?? resolveMarket(code)),
  }
}

export function latestUnitNavFromNavItems(items: Record<string, unknown>[]): number | null {
  if (!items.length) return null
  const sorted = [...items].sort((a, b) => Number(b.nav_date) - Number(a.nav_date))
  return safeFloat(sorted[0]?.unit_nav)
}
