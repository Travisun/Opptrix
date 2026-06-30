import type { IntradayTrendBar, IntradayTrendFetchResult, IntradayTrendSession } from '../utils/intraday-trends.js'
import { cnTodayString, isCnTradingWeekday, shouldPreferTodayIntraday } from '../utils/market-session.js'

export interface TdxMinutePoint {
  price: number
  volume: number
}

/** Map TDX minute index (0–239) → clock time within a session date. */
export function tdxMinuteIndexToClock(index: number): { hour: number; minute: number } {
  const safe = Math.max(0, Math.min(index, 239))
  const totalMinutes = safe < 120
    ? 9 * 60 + 30 + safe
    : 13 * 60 + (safe - 120)
  return { hour: Math.floor(totalMinutes / 60), minute: totalMinutes % 60 }
}

export function tdxMinuteIndexToTime(sessionDate: string, index: number): string {
  const { hour, minute } = tdxMinuteIndexToClock(index)
  const hh = String(hour).padStart(2, '0')
  const mm = String(minute).padStart(2, '0')
  return `${sessionDate} ${hh}:${mm}:00`
}

export function sessionDateToTdxInt(sessionDate: string): number {
  return Number(sessionDate.replace(/-/g, ''))
}

export function addCnCalendarDays(sessionDate: string, delta: number): string {
  const d = new Date(`${sessionDate}T12:00:00+08:00`)
  d.setDate(d.getDate() + delta)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function attachVwap(bars: IntradayTrendBar[]): void {
  let cumVol = 0
  let cumAmt = 0
  for (const bar of bars) {
    cumVol += bar.volume
    cumAmt += bar.price * bar.volume
    bar.avgPrice = cumVol > 0 ? cumAmt / cumVol : bar.price
    bar.amount = bar.price * bar.volume
  }
}

/** TDX minute vol is sometimes cumulative — diff when monotonic. */
export function normalizeTdxMinuteVolumes(points: TdxMinutePoint[]): TdxMinutePoint[] {
  if (points.length < 2) return points
  let increasing = 0
  for (let i = 1; i < points.length; i += 1) {
    if ((points[i].volume ?? 0) >= (points[i - 1].volume ?? 0)) increasing += 1
  }
  if (increasing / (points.length - 1) < 0.85) return points
  return points.map((p, i) => ({
    price: p.price,
    volume: i === 0
      ? (p.volume ?? 0)
      : Math.max(0, (p.volume ?? 0) - (points[i - 1].volume ?? 0)),
  }))
}

export function transformTdxMinutePoints(
  sessionDate: string,
  points: TdxMinutePoint[],
  preClose: number | null = null,
): IntradayTrendSession | null {
  const normalized = normalizeTdxMinuteVolumes(points)
  const bars: IntradayTrendBar[] = []
  for (let i = 0; i < normalized.length; i += 1) {
    const p = normalized[i]
    if (!p || p.price <= 0) continue
    bars.push({
      time: tdxMinuteIndexToTime(sessionDate, i),
      price: p.price,
      volume: p.volume ?? 0,
      amount: 0,
      avgPrice: p.price,
    })
  }
  if (!bars.length) return null
  attachVwap(bars)
  return { sessionDate, preClose, bars }
}

/** Reject TDX sessions whose price level clearly mismatches quote / preClose. */
export function isPlausibleIntradaySession(
  session: IntradayTrendSession,
  refPrice: number | null,
  preClose: number | null,
  allowPartial = false,
): boolean {
  const minBars = allowPartial ? 1 : 5
  if (session.bars.length < minBars) return false
  const anchor = refPrice ?? preClose
  if (anchor == null || anchor <= 0) return true
  const prices = session.bars.map(b => b.price).filter(p => p > 0)
  if (prices.length < minBars) return false
  const med = prices[Math.floor(prices.length / 2)]!
  const ratio = med / anchor
  return ratio >= 0.55 && ratio <= 1.8
}

export function hasIntradaySessionOnDate(
  sessions: IntradayTrendSession[],
  sessionDate: string,
): boolean {
  return sessions.some(row => row.sessionDate === sessionDate && row.bars.length > 0)
}

export function mergeIntradaySessions(
  sessions: IntradayTrendSession[],
  apiPreClose: number | null,
): IntradayTrendFetchResult {
  const map = new Map<string, IntradayTrendSession>()
  for (const row of sessions) {
    if (!row.bars.length) continue
    map.set(row.sessionDate, row)
  }
  const merged = [...map.values()].sort((a, b) => a.sessionDate.localeCompare(b.sessionDate))
  return { sessions: merged, apiPreClose }
}

/** Candidate session dates to probe (weekdays only), newest first. */
export function intradayProbeDates(ndays: number, today = cnTodayString()): string[] {
  const safeDays = Math.max(1, Math.min(Math.floor(ndays), 5))
  const dates: string[] = []
  let cursor = today
  let guard = 0
  while (dates.length < safeDays && guard < safeDays * 10) {
    guard += 1
    const d = new Date(`${cursor}T12:00:00+08:00`)
    if (isCnTradingWeekday(d)) dates.push(cursor)
    cursor = addCnCalendarDays(cursor, -1)
  }
  return dates
}

export function shouldFetchTodayTdxIntraday(today = cnTodayString(), now?: Date): boolean {
  return today === cnTodayString(now) && shouldPreferTodayIntraday(now)
}
