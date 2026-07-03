import type { IndexKline, StockKline } from '../../../core/schema.js'
import type { IntradayTrendBar, IntradayTrendFetchResult, IntradayTrendSession } from '../../../utils/intraday-trends.js'
import { normalizeKlineDateTime } from '../../../utils/helpers.js'
import {
  bareCodeFromTsCode,
  codeFromRow,
  fmtTradeTime,
  fmtYmd,
  num,
  pick,
  rowsFromPayload,
  str,
  type ZzshareRow,
} from './common.js'

const INTRADAY_PERIODS = new Set(['1m', '5m', '15m', '30m', '60m'])
const MINUTE_FREQS = new Set(['1min', '5min', '15min', '30min', '60min'])

export type ZzsharePeriodSpec =
  | { kind: 'daily'; resample?: 'weekly' | 'monthly' }
  | { kind: 'minute'; freq: string }

/** Opptrix period → Zzshare API spec (daily() or stk_mins freq). */
export function opptrixPeriodToZzshareFreq(period: string): ZzsharePeriodSpec | null {
  const p = period.trim().toLowerCase()
  const minuteMap: Record<string, string> = {
    '1m': '1min',
    '5m': '5min',
    '15m': '15min',
    '30m': '30min',
    '60m': '60min',
    '1h': '60min',
  }
  if (minuteMap[p]) return { kind: 'minute', freq: minuteMap[p]! }

  if (p === 'daily' || p === 'day' || p === '1d') return { kind: 'daily' }
  if (p === 'weekly' || p === 'week' || p === '1w') return { kind: 'daily', resample: 'weekly' }
  if (p === 'monthly' || p === 'month' || p === '1mo') return { kind: 'daily', resample: 'monthly' }
  return null
}

export function isIntradayZzsharePeriod(period: string): boolean {
  return INTRADAY_PERIODS.has(period.trim().toLowerCase())
}

export function isZzshareMinuteFreq(freq: string): boolean {
  return MINUTE_FREQS.has(freq)
}

function mapDailyRow(code: string, row: ZzshareRow): StockKline | null {
  const close = num(pick(row, 'close', 'c'))
  if (close == null || close <= 0) return null

  const preClose = num(pick(row, 'pre_close', 'prev_close', 'preclose'))
  let changePct = num(pick(row, 'pct_chg', 'pct_change', 'quote_rate', 'change_pct'))
  if (changePct == null && preClose != null && preClose > 0) {
    changePct = ((close - preClose) / preClose) * 100
  }

  const dateRaw = str(pick(row, 'trade_date', 'date', 'day', 'date1'))
  const date = fmtYmd(dateRaw)

  return {
    code: codeFromRow(row, code),
    date,
    open: num(pick(row, 'open', 'o')) ?? close,
    close,
    high: num(pick(row, 'high', 'h')) ?? close,
    low: num(pick(row, 'low', 'l')) ?? close,
    volume: num(pick(row, 'vol', 'volume')) ?? 0,
    amount: num(pick(row, 'amount', 'turnover')) ?? 0,
    changePct,
    turnoverRate: num(pick(row, 'turnover_rate', 'turn', 'turnoverrate')),
  }
}

function mapMinuteRow(code: string, row: ZzshareRow): StockKline | null {
  const close = num(pick(row, 'close', 'c'))
  if (close == null || close <= 0) return null

  const dateRaw = str(pick(row, 'trade_time', 'datetime', 'time', 'date'))
  const date = normalizeKlineDateTime(fmtTradeTime(dateRaw))

  return {
    code: codeFromRow(row, code),
    date,
    open: num(pick(row, 'open', 'o')) ?? close,
    close,
    high: num(pick(row, 'high', 'h')) ?? close,
    low: num(pick(row, 'low', 'l')) ?? close,
    volume: num(pick(row, 'vol', 'volume')) ?? 0,
    amount: num(pick(row, 'amount', 'turnover')) ?? 0,
    changePct: null,
    turnoverRate: null,
  }
}

export function mapZzshareDailyRows(
  code: string,
  rows: unknown,
  _period = 'daily',
): StockKline[] {
  const out: StockKline[] = []
  for (const row of rowsFromPayload(rows)) {
    const mapped = mapDailyRow(code, row)
    if (mapped) out.push(mapped)
  }
  out.sort((a, b) => a.date.localeCompare(b.date))
  return out
}

export function mapZzshareMinuteRows(
  code: string,
  rows: unknown,
  _period = '1m',
): StockKline[] {
  const out: StockKline[] = []
  for (const row of rowsFromPayload(rows)) {
    const mapped = mapMinuteRow(code, row)
    if (mapped) out.push(mapped)
  }
  out.sort((a, b) => a.date.localeCompare(b.date))
  return out
}

/** open/kline/d/{code} compact { x, y, vol, business_balance } payload. */
export function mapZzshareCompactKlineRows(code: string, data: unknown): StockKline[] {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return []
  const payload = data as Record<string, unknown>
  const dates = payload.x
  const yData = payload.y
  if (!Array.isArray(dates) || !Array.isArray(yData)) return []

  const vols = Array.isArray(payload.vol) ? payload.vol : []
  const amounts = Array.isArray(payload.business_balance) ? payload.business_balance : []
  const bare = bareCodeFromTsCode(code)
  const out: StockKline[] = []

  for (let i = 0; i < dates.length; i++) {
    const y = yData[i]
    if (!Array.isArray(y) || y.length < 5) continue
    const open = num(y[0]) ?? 0
    const close = num(y[1]) ?? open
    const high = num(y[2]) ?? close
    const low = num(y[3]) ?? close
    const preClose = num(y[4])
    let changePct: number | null = null
    if (preClose != null && preClose !== 0) {
      changePct = ((close - preClose) / preClose) * 100
    }
    out.push({
      code: bare,
      date: fmtYmd(dates[i]),
      open,
      close,
      high,
      low,
      volume: num(vols[i]) ?? 0,
      amount: num(amounts[i]) ?? 0,
      changePct,
      turnoverRate: null,
    })
  }

  out.sort((a, b) => a.date.localeCompare(b.date))
  return out
}

export function mapZzshareIndexKlineRows(
  code: string,
  rows: unknown,
  period = 'daily',
): IndexKline[] {
  const intraday = isIntradayZzsharePeriod(period)
  const stockRows = intraday
    ? mapZzshareMinuteRows(code, rows, period)
    : mapZzshareDailyRows(code, rows, period)
  return stockRows.map(k => ({
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

export function mapZzsharePlateOrTopicKlineRows(code: string, data: unknown): IndexKline[] {
  const compact = mapZzshareCompactKlineRows(code, data)
  if (compact.length) {
    return compact.map(k => ({
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
  return mapZzshareIndexKlineRows(code, data, 'daily')
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
