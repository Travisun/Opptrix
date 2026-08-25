import type {
  Dividend, DragonTiger, FinancialSummary, IndexKline, IndexRealtime,
  LimitUpDown, SentimentData, StockKline, StockListItem, StockProfile, StockRealtime,
} from '../../../core/schema.js'
import { normalizeCode, safeFloat, resolveMarket } from '../../../utils/helpers.js'
import { exchangeFromThsCode, fromThsCode } from '../api/symbols.js'

function msToYmd(ms: unknown): string {
  const n = Number(ms)
  if (!Number.isFinite(n) || n <= 0) return ''
  const d = new Date(n)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function fiscalPeriodLabel(row: Record<string, unknown>): string {
  const fp = String(row.fiscal_period ?? '')
  const fy = row.fiscal_year
  if (fp === 'FY') return `${fy}年报`
  if (fp === 'Q1') return `${fy}一季报`
  if (fp === 'Q2') return `${fy}中报`
  if (fp === 'Q3') return `${fy}三季报`
  if (fp === 'Q4') return `${fy}四季报`
  return String(row.period ?? fp ?? '')
}

export type ValuationExtras = {
  pe_mrq?: number | null
  ps_ttm?: number | null
  pcf_ttm?: number | null
}

export type MappedValuation = {
  pe: number | null
  pb: number | null
  extras: ValuationExtras
}

/** Fuyao valuations/snapshot → pe（TTM）/ pb（MRQ）及扩展指标 */
export function mapValuationSnapshotItem(
  item: Record<string, unknown> | null | undefined,
): MappedValuation | null {
  if (!item || typeof item !== 'object') return null
  const pe = safeFloat(item.pe_ttm)
  const pb = safeFloat(item.pb_mrq)
  const extras: ValuationExtras = {
    pe_mrq: safeFloat(item.pe_mrq),
    ps_ttm: safeFloat(item.ps_ttm),
    pcf_ttm: safeFloat(item.pcf_ttm),
  }
  const hasValue = pe != null || pb != null
    || Object.values(extras).some(v => v != null)
  if (!hasValue) return null
  return { pe, pb, extras }
}

export function indexValuationItems(
  items: Record<string, unknown>[],
): Map<string, MappedValuation> {
  const map = new Map<string, MappedValuation>()
  for (const item of items) {
    const thscode = String(item.thscode ?? '').trim()
    const mapped = mapValuationSnapshotItem(item)
    if (thscode && mapped) map.set(thscode, mapped)
  }
  return map
}

export function applyValuationToStockRealtime(
  rt: StockRealtime,
  val: MappedValuation | null | undefined,
): StockRealtime {
  if (!val) return rt
  return {
    ...rt,
    pe: val.pe ?? rt.pe,
    pb: val.pb ?? rt.pb,
  }
}

function formatValuationMetric(n: number): string {
  if (!Number.isFinite(n)) return '—'
  const abs = Math.abs(n)
  if (abs >= 100) return n.toFixed(2)
  if (abs >= 10) return n.toFixed(3)
  return n.toFixed(4)
}

/** 个股概况 profileMetrics 用中文标签 */
export function buildValuationProfileMetrics(
  item: Record<string, unknown> | null | undefined,
): Array<{ label: string; value: string }> {
  const mapped = mapValuationSnapshotItem(item)
  if (!mapped) return []
  const out: Array<{ label: string; value: string }> = []
  if (mapped.pe != null) {
    out.push({ label: '市盈率（TTM）', value: formatValuationMetric(mapped.pe) })
  }
  if (mapped.pb != null) {
    out.push({ label: '市净率（MRQ）', value: formatValuationMetric(mapped.pb) })
  }
  const { pe_mrq, ps_ttm, pcf_ttm } = mapped.extras
  if (pe_mrq != null) {
    out.push({ label: '市盈率（MRQ）', value: formatValuationMetric(pe_mrq) })
  }
  if (ps_ttm != null) {
    out.push({ label: '市销率（TTM）', value: formatValuationMetric(ps_ttm) })
  }
  if (pcf_ttm != null) {
    out.push({ label: '市现率（TTM）', value: formatValuationMetric(pcf_ttm) })
  }
  return out
}

export function mapSnapshotToStockRealtime(
  snap: Record<string, unknown>,
  name = '',
): StockRealtime {
  const thscode = String(snap.thscode ?? snap.ticker ?? '')
  const code = fromThsCode(thscode)
  const exchange = exchangeFromThsCode(thscode) ?? undefined
  const prev = safeFloat(snap.prev_price)
  const price = safeFloat(snap.last_price)
  const changePct = safeFloat(snap.price_change_ratio_pct)
  return {
    code,
    name: name || code,
    ...(exchange ? { exchange } : {}),
    price,
    changePct,
    change: safeFloat(snap.price_change),
    open: safeFloat(snap.open_price),
    high: safeFloat(snap.high_price),
    low: safeFloat(snap.low_price),
    preClose: prev,
    volume: safeFloat(snap.volume) ?? 0,
    amount: safeFloat(snap.turnover) ?? 0,
    pe: null,
    pb: null,
    turnoverRate: null,
  }
}

export function mapSnapshotToIndexRealtime(snap: Record<string, unknown>, name = ''): IndexRealtime {
  const base = mapSnapshotToStockRealtime(snap, name)
  return {
    code: base.code,
    name: base.name,
    price: base.price,
    open: base.open,
    high: base.high,
    low: base.low,
    preClose: base.preClose,
    change: base.change,
    changePct: base.changePct,
    volume: base.volume,
    amount: base.amount,
  }
}

export function mapHistoricalBarToKline(code: string, bar: Record<string, unknown>): StockKline {
  const prevClose = safeFloat(bar.prev_price)
  const close = safeFloat(bar.close_price)
  const changePct = prevClose && close != null ? ((close - prevClose) / prevClose) * 100 : null
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

export function mapHistoricalBarToIndexKline(code: string, bar: Record<string, unknown>): IndexKline {
  const row = mapHistoricalBarToKline(code, bar)
  return {
    code: row.code,
    date: row.date,
    open: row.open,
    close: row.close,
    high: row.high,
    low: row.low,
    volume: row.volume,
    amount: row.amount,
    changePct: row.changePct,
  }
}

export function mapTickerItem(row: Record<string, unknown>): StockListItem {
  const code = fromThsCode(String(row.thscode ?? row.ticker ?? ''))
  return {
    code,
    name: String(row.name ?? ''),
    industry: '',
    market: String(row.exchange ?? resolveMarket(code)),
  }
}

export function mapTickerToProfile(row: Record<string, unknown>): StockProfile {
  return {
    code: fromThsCode(String(row.thscode ?? row.ticker ?? '')),
    name: String(row.name ?? ''),
    orgName: String(row.name ?? ''),
    securityType: String(row.asset_type ?? ''),
  }
}

export function mapIncomeRow(code: string, row: Record<string, unknown>): FinancialSummary {
  return {
    code: normalizeCode(code),
    reportDate: msToYmd(row.period_end_ms),
    reportType: fiscalPeriodLabel(row),
    revenue: safeFloat(row.operating_income),
    revenueYoy: null,
    netProfit: safeFloat(row.parent_holder_net_profit ?? row.net_profit),
    netProfitYoy: null,
    eps: safeFloat(row.basic_eps),
    roe: null,
    grossMargin: null,
    debtRatio: null,
    operatingCashFlow: null,
  }
}

function filterFinancialStatementRows(
  rows: Record<string, unknown>[],
  reportDate: string,
): Record<string, unknown>[] {
  const sorted = [...rows].sort((a, b) =>
    msToYmd(b.period_end_ms).localeCompare(msToYmd(a.period_end_ms)),
  )
  if (!reportDate) return sorted
  const hint = reportDate.slice(0, 10)
  return sorted.filter(r => msToYmd(r.period_end_ms) >= hint)
}

function mapFinancialStatementRow(code: string, row: Record<string, unknown>): Record<string, unknown> {
  return {
    ...row,
    code: normalizeCode(code),
    reportDate: msToYmd(row.period_end_ms),
    reportType: fiscalPeriodLabel(row),
    source: 'tonghuashun',
  }
}

export function mapBalanceSheetRows(
  code: string,
  rows: Record<string, unknown>[],
  reportDate = '',
): Record<string, unknown>[] {
  return filterFinancialStatementRows(rows, reportDate).map(r => mapFinancialStatementRow(code, r))
}

export function mapIncomeStatementRows(
  code: string,
  rows: Record<string, unknown>[],
  reportDate = '',
): Record<string, unknown>[] {
  return filterFinancialStatementRows(rows, reportDate).map(r => mapFinancialStatementRow(code, r))
}

export function mapCashFlowRows(
  code: string,
  rows: Record<string, unknown>[],
  reportDate = '',
): Record<string, unknown>[] {
  return filterFinancialStatementRows(rows, reportDate).map(r => mapFinancialStatementRow(code, r))
}

export function mapAdjustmentToDividend(code: string, row: Record<string, unknown>): Dividend | null {
  const cash = safeFloat(row.dividend_per_share)
  const bonus = safeFloat(row.per_share_bonus)
  if ((cash ?? 0) <= 0 && (bonus ?? 0) <= 0) return null
  const exDate = msToYmd(row.ex_date_ms)
  return {
    code: normalizeCode(code),
    year: exDate.slice(0, 4),
    cashBonus: cash,
    exDate,
    plan: bonus && bonus > 0 ? `${bonus}送股 + ${cash ?? 0}派息` : `${cash ?? 0}派息`,
  }
}

export function mapDragonTigerStock(row: Record<string, unknown>, tradeDate: string): DragonTiger {
  return {
    code: fromThsCode(String(row.thscode ?? row.ticker ?? '')),
    name: String(row.name ?? ''),
    date: tradeDate,
    reason: String(row.concepts ?? row.reason ?? ''),
    netAmount: safeFloat(row.net_value ?? row.net_buy),
    changePct: safeFloat(row.price_change_ratio_pct),
  }
}

export function mapLimitUpRow(row: Record<string, unknown>): LimitUpDown {
  const continueDayCnt = safeFloat(row.continue_day_cnt ?? row.limit_up_days ?? row.board_num)
  const continueDayText = String(
    row.continue_day_text ?? row.board_label ?? row.limit_up_label ?? '',
  ).trim()
  return {
    code: fromThsCode(String(row.thscode ?? row.ticker ?? '')),
    name: String(row.name ?? ''),
    date: msToYmd(row.limit_up_time) || '',
    type: 'limit_up',
    changePct: safeFloat(row.price_change_ratio_pct),
    reason: String(row.limit_up_reason ?? row.reason ?? '').trim() || undefined,
    continueDayText: continueDayText || undefined,
    continueDayCnt,
  }
}

export function mapHotStockSentiment(code: string, row: Record<string, unknown>): SentimentData {
  return {
    code: normalizeCode(code),
    label: 'neutral',
    summary: String(row.analyse ?? row.analyse_title ?? row.topic ?? `热榜第${row.rank ?? ''}`),
    timestamp: new Date().toISOString(),
  }
}

export function resampleKlines(klines: StockKline[], mode: 'weekly' | 'monthly'): StockKline[] {
  if (!klines.length) return []
  const buckets = new Map<string, StockKline[]>()
  for (const bar of klines) {
    const d = new Date(bar.date.slice(0, 10))
    if (Number.isNaN(d.getTime())) continue
    let key: string
    if (mode === 'weekly') {
      const day = d.getDay() || 7
      d.setDate(d.getDate() + 4 - day)
      key = `${d.getFullYear()}-W${Math.ceil((((d.getTime() - new Date(d.getFullYear(), 0, 1).getTime()) / 86400000) + 1) / 7)}`
    } else {
      key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    }
    const list = buckets.get(key) ?? []
    list.push(bar)
    buckets.set(key, list)
  }
  return [...buckets.values()].map(bars => {
    bars.sort((a, b) => a.date.localeCompare(b.date))
    const first = bars[0]!
    const last = bars[bars.length - 1]!
    return {
      code: first.code,
      date: last.date,
      open: first.open,
      close: last.close,
      high: Math.max(...bars.map(b => b.high)),
      low: Math.min(...bars.map(b => b.low)),
      volume: bars.reduce((s, b) => s + (b.volume ?? 0), 0),
      amount: bars.reduce((s, b) => s + (b.amount ?? 0), 0),
      changePct: last.changePct,
      turnoverRate: null,
    }
  })
}

export {
  computeEtfPremiumRate,
  mapFundProfileToEtfProfileRow,
  mapFundNavRows,
  mapFundHoldingsToEtfRows,
  mapFundMarketSnapshotToStockRealtime,
  mapFundHistoricalBarsToKlines,
  mapFundReturnsToPerformance,
  mapFundTickerToListItem,
} from './fund.js'
