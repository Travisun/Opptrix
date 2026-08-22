import type { StockKline } from '@opptrix/shared'
import type { CompactKlineData, TickflowPeriod } from '../api/client.js'
import { parseTickflowSymbol, type TickflowRegion } from '../api/symbols.js'

const YEAR1_BARS = 260
const YEAR3_BARS = 780
const YEAR5_BARS = 1300
const FIVEDAY_MINUTE_BARS = 2000
const INTRADAY_MINUTE_BARS = 400

export type ResolvedTickflowKlineQuery = {
  tfPeriod: TickflowPeriod
  count?: number
}

function num(v: unknown): number | null {
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

const INTRADAY_PERIODS = new Set(['1m', '5m', '10m', '15m', '30m', '60m'])

/** 券商图表周期 → TickFlow `GET /v1/klines` 的 period（免费档实测 1d/1w/1M/1Q/1Y 可用）。 */
export const BROKER_CHART_PERIOD_TO_TICKFLOW: Readonly<Record<string, TickflowPeriod>> = {
  daily: '1d',
  weekly: '1w',
  monthly: '1M',
  quarterly: '1Q',
  yearly: '1Y',
}

/** Opptrix period → TickFlow period */
export function opptrixPeriodToTickflow(period: string): string | null {
  const raw = period.trim()
  const caseSensitive: Record<string, string> = {
    '1M': '1M',
    '1Q': '1Q',
    '1Y': '1Y',
  }
  if (caseSensitive[raw]) return caseSensitive[raw]

  const p = raw.toLowerCase()
  const map: Record<string, string> = {
    '1m': '1m',
    '5m': '5m',
    '10m': '10m',
    '15m': '15m',
    '30m': '30m',
    '60m': '60m',
    '1h': '60m',
    daily: '1d',
    '1d': '1d',
    day: '1d',
    weekly: '1w',
    '1w': '1w',
    week: '1w',
    monthly: '1M',
    month: '1M',
    quarterly: '1Q',
    quarter: '1Q',
    yearly: '1Y',
    year: '1Y',
  }
  return map[p] ?? null
}

/**
 * Opptrix 图表 / Engine 周期 → TickFlow `GET /v1/klines` 的 period + count。
 * 官方周期：1m,5m,10m,15m,30m,60m,1d,1w,1M,1Q,1Y（均经 klines 接口传入 period）。
 */
export function resolveTickflowKlineQuery(
  period: string,
  count?: number,
): ResolvedTickflowKlineQuery | null {
  const p = period.trim().toLowerCase()
  if (p === 'intraday' || p === 'minute') {
    const want = count != null && count > 0 ? Math.max(count, INTRADAY_MINUTE_BARS) : INTRADAY_MINUTE_BARS
    return { tfPeriod: '1m', count: want }
  }
  if (p === '5day' || p === 'fdays' || p === 'five') {
    return {
      tfPeriod: '1m',
      count: Math.max(count ?? 0, FIVEDAY_MINUTE_BARS),
    }
  }
  if (p === 'year1' || p === '1y') {
    return { tfPeriod: '1d', count: Math.max(count ?? 0, YEAR1_BARS) }
  }
  if (p === 'year3' || p === '3y') {
    return { tfPeriod: '1d', count: Math.max(count ?? 0, YEAR3_BARS) }
  }
  if (p === 'year5' || p === '5y') {
    return { tfPeriod: '1d', count: Math.max(count ?? 0, YEAR5_BARS) }
  }
  const tfPeriod = opptrixPeriodToTickflow(period) as TickflowPeriod | null
  if (!tfPeriod) return null
  const resolvedCount = count != null && count > 0 ? count : undefined
  return { tfPeriod, count: resolvedCount }
}

/** 图表 UI 周期是否直接对应 TickFlow klines period（非日 K 根数窗口）。 */
export function isBrokerOhlcTickflowPeriod(period: string): boolean {
  const p = period.trim().toLowerCase()
  return p in BROKER_CHART_PERIOD_TO_TICKFLOW
}

export function isIntradayTickflowPeriod(period: string): boolean {
  return INTRADAY_PERIODS.has(period)
}

function klineTimezone(region: TickflowRegion): string {
  return region === 'US' ? 'America/New_York' : 'Asia/Shanghai'
}

export function timestampToKlineDate(
  ms: number,
  period: string,
  region: TickflowRegion,
): string {
  const tz = klineTimezone(region)
  const d = new Date(ms)
  if (isIntradayTickflowPeriod(period)) {
    const date = d.toLocaleDateString('en-CA', { timeZone: tz })
    const time = d.toLocaleTimeString('en-GB', {
      timeZone: tz,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    })
    return `${date} ${time}`
  }
  return d.toLocaleDateString('en-CA', { timeZone: tz })
}

export function ymdToMs(ymd: string, endOfDay = false): number {
  const [y, m, d] = ymd.slice(0, 10).split('-').map(Number)
  if (!y || !m || !d) return NaN
  if (endOfDay) return Date.UTC(y, m - 1, d, 23, 59, 59, 999)
  return Date.UTC(y, m - 1, d, 0, 0, 0, 0)
}

export function expandCompactKlines(
  tickflowSymbol: string,
  data: CompactKlineData,
  period: string,
  region: TickflowRegion,
): StockKline[] {
  const { code } = parseTickflowSymbol(tickflowSymbol)
  const len = data.timestamp?.length ?? 0
  const out: StockKline[] = []
  let prevClose: number | null = null

  for (let i = 0; i < len; i++) {
    const ts = num(data.timestamp[i])
    if (ts == null) continue
    const close = num(data.close[i]) ?? 0
    const open = num(data.open[i]) ?? close
    const high = num(data.high[i]) ?? close
    const low = num(data.low[i]) ?? close
    const volume = num(data.volume[i]) ?? 0
    const amount = num(data.amount?.[i]) ?? 0
    const barPrev = num(data.prev_close?.[i]) ?? prevClose
    let changePct: number | null = null
    if (barPrev != null && barPrev !== 0) {
      changePct = ((close - barPrev) / barPrev) * 100
    }
    prevClose = close

    out.push({
      code,
      date: timestampToKlineDate(ts, period, region),
      open,
      close,
      high,
      low,
      volume,
      amount,
      changePct,
      turnoverRate: null,
    })
  }

  out.sort((a, b) => a.date.localeCompare(b.date))
  return out
}
