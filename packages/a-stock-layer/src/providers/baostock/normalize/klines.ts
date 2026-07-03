import type { IndexKline, StockKline } from '../../../core/schema.js'
import type { IntradayTrendBar, IntradayTrendFetchResult, IntradayTrendSession } from '../../../utils/intraday-trends.js'
import { normalizeKlineDateTime, normalizeCode } from '../../../utils/helpers.js'
import { zipBaostockRows, type BaostockResult, ensureBaostockKlineFields } from '../api/client.js'
import { fromBaostockCode } from '../api/symbols.js'

/** Baostock 前复权 */
export const BAOSTOCK_ADJUST_FORWARD = '2'

export const KLINE_QUERY_FIELDS = ensureBaostockKlineFields(
  'date,code,open,high,low,close,preclose,volume,amount,adjustflag,turn,tradestatus,pctChg,isST',
)

const INTRADAY_PERIODS = new Set(['1m', '5m', '15m', '30m', '60m'])

function num(v: unknown): number | null {
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function str(v: unknown): string {
  return v == null ? '' : String(v)
}

/** Opptrix period → baostock frequency */
export function opptrixPeriodToBaostock(period: string): string | null {
  const p = period.trim().toLowerCase()
  const map: Record<string, string> = {
    daily: 'd',
    day: 'd',
    '1d': 'd',
    weekly: 'w',
    week: 'w',
    '1w': 'w',
    monthly: 'm',
    month: 'm',
    '1m': '1',
    '5m': '5',
    '15m': '15',
    '30m': '30',
    '60m': '60',
    '1h': '60',
  }
  return map[p] ?? null
}

export function isIntradayBaostockPeriod(period: string): boolean {
  return INTRADAY_PERIODS.has(period.trim().toLowerCase())
}

export function todayYmd(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function ymdDaysAgo(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() - days)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function mapKlineRow(code: string, row: Record<string, string>, intraday: boolean): StockKline | null {
  const close = num(row.close)
  if (close == null || close <= 0) return null
  const tradeStatus = str(row.tradestatus)
  if (tradeStatus === '0') return null

  const dateRaw = str(row.date)
  const date = intraday ? normalizeKlineDateTime(dateRaw) : dateRaw.slice(0, 10)

  return {
    code: normalizeCode(code),
    date,
    open: num(row.open) ?? close,
    close,
    high: num(row.high) ?? close,
    low: num(row.low) ?? close,
    volume: num(row.volume) ?? 0,
    amount: num(row.amount) ?? 0,
    changePct: num(row.pctChg),
    turnoverRate: num(row.turn),
  }
}

export function mapBaostockKlineRows(
  code: string,
  result: BaostockResult,
  period: string,
): StockKline[] {
  const intraday = isIntradayBaostockPeriod(period)
  const rows = zipBaostockRows(result)
  const out: StockKline[] = []
  for (const row of rows) {
    const mapped = mapKlineRow(code, row, intraday)
    if (mapped) out.push(mapped)
  }
  out.sort((a, b) => a.date.localeCompare(b.date))
  return out
}

export function mapBaostockIndexKlineRows(
  code: string,
  result: BaostockResult,
  period: string,
): IndexKline[] {
  return mapBaostockKlineRows(code, result, period).map(k => ({
    code: k.code,
    date: k.date,
    open: k.open,
    close: k.close,
    high: k.high,
    low: k.low,
    volume: k.volume,
    amount: k.amount,
    changePct: k.changePct,
  }))
}

export function groupMinuteKlinesToSessions(
  klines: StockKline[],
  apiPreClose: number | null = null,
): IntradayTrendFetchResult | null {
  if (!klines.length) return null

  const sessionMap = new Map<string, IntradayTrendBar[]>()
  for (const bar of klines) {
    const sessionDate = bar.date.slice(0, 10)
    const list = sessionMap.get(sessionDate) ?? []
    list.push({
      time: bar.date.length > 10 ? bar.date : `${sessionDate} 09:30:00`,
      price: bar.close,
      volume: bar.volume ?? 0,
      amount: bar.amount ?? 0,
      avgPrice: bar.close,
    })
    sessionMap.set(sessionDate, list)
  }

  const sessions: IntradayTrendSession[] = [...sessionMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([sessionDate, bars]) => ({
      sessionDate,
      preClose: null,
      bars: bars.sort((a, b) => a.time.localeCompare(b.time)),
    }))

  if (sessions.length && apiPreClose != null && apiPreClose > 0) {
    sessions[sessions.length - 1]!.preClose = apiPreClose
  }

  return sessions.length ? { sessions, apiPreClose } : null
}

export function latestOpenTradeDate(rows: Record<string, string>[], onOrBefore: string): string | null {
  const target = onOrBefore.slice(0, 10)
  const open = rows
    .filter(r => str(r.is_trading_day ?? r.isTradingDay) === '1')
    .map(r => str(r.calendar_date ?? r.date).slice(0, 10))
    .filter(d => d && d <= target)
    .sort()
  return open.length ? open[open.length - 1]! : null
}

export function bareCodeFromBaostock(raw: string): string {
  const sym = fromBaostockCode(raw)
  const dot = sym.indexOf('.')
  return normalizeCode(dot > 0 ? sym.slice(0, dot) : sym)
}

export function baostockCodeFromRow(row: Record<string, string>, fallback: string): string {
  const raw = str(row.code)
  return raw.includes('.') ? bareCodeFromBaostock(raw) : normalizeCode(fallback || raw)
}
