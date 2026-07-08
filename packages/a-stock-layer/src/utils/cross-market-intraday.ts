import type { StockKline } from '../core/schema.js'
import { regionalTodayString, isRegionalTradingDay } from './regional-calendar.js'
import { isUsTradingDay, usTodayString } from './us-market.js'

export type CrossMarketChartMarket = 'HK' | 'US'

export function crossMarketChartTimeZone(market: CrossMarketChartMarket): string {
  return market === 'US' ? 'America/New_York' : 'Asia/Hong_Kong'
}

export function crossMarketSessionDate(market: CrossMarketChartMarket, d = new Date()): string {
  return market === 'US' ? usTodayString(d) : regionalTodayString('HK', d)
}

export function isCrossMarketTradingDay(market: CrossMarketChartMarket, sessionDate: string): boolean {
  return market === 'US' ? isUsTradingDay(sessionDate) : isRegionalTradingDay('HK', new Date(`${sessionDate}T12:00:00`))
}

/** 解析 `GMT+8` / `GMT-5` → `+08:00` / `-05:00` */
export function timezoneOffsetIso(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    timeZoneName: 'shortOffset',
  }).formatToParts(date)
  const raw = parts.find(part => part.type === 'timeZoneName')?.value ?? 'GMT'
  const match = raw.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/)
  if (!match) return '+00:00'
  const sign = match[1]
  const hours = match[2]!.padStart(2, '0')
  const mins = match[3] ?? '00'
  return `${sign}${hours}:${mins}`
}

/** 市场本地 `YYYY-MM-DD HH:MM:SS` → 带时区 ISO，供 lightweight-charts 解析 */
export function marketLocalDatetimeToIso(
  market: CrossMarketChartMarket,
  localDatetime: string,
): string {
  const match = localDatetime.match(/^(\d{4}-\d{2}-\d{2})\s(\d{2}:\d{2}:\d{2})$/)
  if (!match) return localDatetime
  const [, date, clock] = match
  const tz = crossMarketChartTimeZone(market)
  const offset = timezoneOffsetIso(new Date(`${date}T12:00:00Z`), tz)
  return `${date}T${clock}${offset}`
}

/** 腾讯 minute/query 分钟 K → 图表分时点（含累计均价） */
export function minuteKlinesToIntradayItems(
  market: CrossMarketChartMarket,
  klines: StockKline[],
): Array<Record<string, unknown>> {
  const sorted = [...klines].sort((a, b) => a.date.localeCompare(b.date))
  let cumVolume = 0
  let cumAmount = 0
  const out: Array<Record<string, unknown>> = []

  for (const bar of sorted) {
    const price = bar.close
    if (!Number.isFinite(price) || price <= 0) continue
    cumVolume += bar.volume ?? 0
    cumAmount += bar.amount ?? 0
    const avgPrice = cumVolume > 0 ? cumAmount / cumVolume : price
    out.push({
      time: marketLocalDatetimeToIso(market, bar.date),
      price,
      volume: bar.volume ?? 0,
      amount: bar.amount ?? 0,
      avg_price: avgPrice,
    })
  }
  return out
}

export function intradaySessionDateFromKlines(klines: StockKline[]): string | null {
  if (!klines.length) return null
  const sorted = [...klines].sort((a, b) => a.date.localeCompare(b.date))
  return sorted[sorted.length - 1]!.date.slice(0, 10) || null
}

export type HkFdaysDay = {
  date: string
  preClose?: number | null
  points?: Array<Record<string, unknown>>
}

/** 腾讯港股 day/query 五日结构（含 points 数组，非 OHLC） */
export function isHkFdaysPayload(items: Record<string, unknown>[]): boolean {
  if (!items.length) return false
  const first = items[0]!
  return Array.isArray(first.points) && typeof first.date === 'string'
}

/** 港股五日分时 → 图表点（按日累计均价） */
export function hkFdaysToIntradayItems(
  market: CrossMarketChartMarket,
  days: HkFdaysDay[],
): Array<Record<string, unknown>> {
  const sortedDays = [...days].sort((a, b) => String(a.date).localeCompare(String(b.date)))
  const out: Array<Record<string, unknown>> = []

  for (const day of sortedDays) {
    const date = String(day.date ?? '').slice(0, 10)
    if (!date) continue
    let cumVolume = 0
    let cumAmount = 0
    for (const pt of day.points ?? []) {
      const price = Number(pt.price)
      if (!Number.isFinite(price) || price <= 0) continue
      const rawTime = String(pt.time ?? '')
      const clock = /^\d{2}:\d{2}$/.test(rawTime) ? `${rawTime}:00` : rawTime
      const volume = Number(pt.volume ?? 0)
      const amount = Number(pt.amount ?? 0) || price * volume
      cumVolume += volume
      cumAmount += amount
      const avgPrice = cumVolume > 0 ? cumAmount / cumVolume : price
      out.push({
        time: marketLocalDatetimeToIso(market, `${date} ${clock}`),
        price,
        volume,
        amount,
        avg_price: avgPrice,
      })
    }
  }
  return out
}
