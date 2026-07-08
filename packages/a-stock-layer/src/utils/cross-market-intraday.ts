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
