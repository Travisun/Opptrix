import type { RegionalEquityMarket } from './regional-symbol.js'
import { isRegionalHoliday } from './regional-holidays.js'

const TZ: Record<RegionalEquityMarket, string> = {
  JP: 'Asia/Tokyo',
  KR: 'Asia/Seoul',
  HK: 'Asia/Hong_Kong',
}

/** YYYY-MM-DD in market local timezone */
export function regionalTodayString(market: RegionalEquityMarket, d = new Date()): string {
  return d.toLocaleDateString('en-CA', { timeZone: TZ[market] })
}

export function isRegionalTradingWeekday(market: RegionalEquityMarket, d = new Date()): boolean {
  const wd = new Intl.DateTimeFormat('en-US', { timeZone: TZ[market], weekday: 'short' }).format(d)
  return wd !== 'Sat' && wd !== 'Sun'
}

/** Weekday + exchange holiday table (static MVP) */
export function isRegionalTradingDay(market: RegionalEquityMarket, d = new Date()): boolean {
  const dateStr = regionalTodayString(market, d)
  if (!isRegionalTradingWeekday(market, d)) return false
  return !isRegionalHoliday(market, dateStr)
}

export { isRegionalHoliday, regionalHolidaysForYear } from './regional-holidays.js'
