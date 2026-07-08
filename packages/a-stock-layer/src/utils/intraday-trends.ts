import { normalizeKlineDateTime, safeFloat } from './helpers.js'
import { shouldPreferTodayIntraday, cnTodayString } from './market-session.js'

export interface IntradayTrendBar {
  time: string
  price: number
  volume: number
  amount: number
  avgPrice: number
}

export interface IntradayTrendSession {
  sessionDate: string
  preClose: number | null
  bars: IntradayTrendBar[]
}

export interface IntradayTrendFetchResult {
  sessions: IntradayTrendSession[]
  apiPreClose: number | null
}

export function parseTrend2IntradayLine(line: string): IntradayTrendBar | null {
  const parts = line.split(',')
  if (parts.length < 8) return null

  const timeRaw = normalizeKlineDateTime(String(parts[0] ?? ''))
  if (!timeRaw) return null

  const price = safeFloat(parts[2]) ?? safeFloat(parts[1])
  if (price == null || price <= 0) return null

  const avgPrice = safeFloat(parts[7]) ?? price
  return {
    time: timeRaw.length <= 10 ? `${timeRaw} 09:30:00` : timeRaw,
    price,
    volume: safeFloat(parts[5]) ?? 0,
    amount: safeFloat(parts[6]) ?? 0,
    avgPrice,
  }
}

export function groupTrendsIntoSessions(trends: string[]): IntradayTrendSession[] {
  const map = new Map<string, IntradayTrendBar[]>()

  for (const line of trends) {
    const bar = parseTrend2IntradayLine(line)
    if (!bar) continue
    const sessionDate = bar.time.slice(0, 10)
    const list = map.get(sessionDate) ?? []
    list.push(bar)
    map.set(sessionDate, list)
  }

  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([sessionDate, bars]) => ({
      sessionDate,
      preClose: null,
      bars: bars.sort((a, b) => a.time.localeCompare(b.time)),
    }))
}

export function pickIntradaySession(
  sessions: IntradayTrendSession[],
  today = cnTodayString(),
  preferToday = shouldPreferTodayIntraday(),
): IntradayTrendSession | null {
  if (!sessions.length) return null

  if (preferToday) {
    const todaySession = sessions.find(row => row.sessionDate === today)
    if (todaySession?.bars.length) return todaySession
  }

  for (let i = sessions.length - 1; i >= 0; i -= 1) {
    if (sessions[i].bars.length) return sessions[i]
  }

  return null
}

/** 分钟 K 线 → 分时会话（供 baostock/zzshare/在线 fallback 复用） */
export function minuteKlinesToIntradaySessions(
  klines: Array<{
    date: string
    close: number
    volume?: number | null
    amount?: number | null
  }>,
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

export function attachApiPreCloseToLatestSession(
  sessions: IntradayTrendSession[],
  apiPreClose: number | null,
): void {
  if (apiPreClose == null || apiPreClose <= 0 || !sessions.length) return
  sessions[sessions.length - 1].preClose = apiPreClose
}
