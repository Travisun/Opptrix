/** US market session & symbol helpers — America/New_York */

import { isUsTradingDay, isNyseHoliday, nyseHolidaysForYear } from './us-holidays.js'

export { isUsTradingDay, isNyseHoliday, nyseHolidaysForYear }

const US_TZ = 'America/New_York'

export function normalizeUsSymbol(symbol: string): string {
  const raw = symbol.trim().toUpperCase()
  const stripped = raw.replace(/^(US|NYSE|NASDAQ|AMEX):/i, '')
  return stripped.replace(/[^A-Z0-9.-]/g, '')
}

export function isValidUsSymbol(symbol: string): boolean {
  const s = normalizeUsSymbol(symbol)
  if (!s || s.length > 12) return false
  return /^[A-Z][A-Z0-9.-]{0,11}$/.test(s)
}

export function usNow(): Date {
  return new Date()
}

/** YYYY-MM-DD in US Eastern */
export function usTodayString(d = usNow()): string {
  return d.toLocaleDateString('en-CA', { timeZone: US_TZ })
}

export function isUsTradingWeekday(d = usNow()): boolean {
  return isUsTradingDay(usTodayString(d))
}

/** Regular session 9:30–16:00 ET — weekday + NYSE holiday calendar */
export function isUsMarketOpen(d = usNow()): boolean {
  const today = usTodayString(d)
  if (!isUsTradingDay(today)) return false
  const mins = usEasternMinutes(d)
  return mins >= 9 * 60 + 30 && mins < 16 * 60
}

export function usDateDaysAgo(days: number, from = usNow()): string {
  const d = new Date(from)
  d.setDate(d.getDate() - days)
  return usTodayString(d)
}

/** Polygon aggs use ms timestamps → YYYY-MM-DD ET */
export function usDateFromMs(ms: number): string {
  return usTodayString(new Date(ms))
}

export type UsQuoteSession = 'pre' | 'regular' | 'post' | 'closed'

function usEasternMinutes(d: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: US_TZ,
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  }).formatToParts(d)
  const hour = Number(parts.find(p => p.type === 'hour')?.value ?? 0)
  const minute = Number(parts.find(p => p.type === 'minute')?.value ?? 0)
  return hour * 60 + minute
}

/** Pre 4:00–9:30 · Regular 9:30–16:00 · Post 16:00–20:00 ET (weekday, non-holiday). */
export function resolveUsQuoteSession(d = usNow()): UsQuoteSession {
  const today = usTodayString(d)
  if (!isUsTradingDay(today)) return 'closed'
  const mins = usEasternMinutes(d)
  if (mins >= 4 * 60 && mins < 9 * 60 + 30) return 'pre'
  if (mins >= 9 * 60 + 30 && mins < 16 * 60) return 'regular'
  if (mins >= 16 * 60 && mins < 20 * 60) return 'post'
  return 'closed'
}

export function usQuoteSessionLabel(session: UsQuoteSession): string {
  switch (session) {
    case 'pre': return '盘前'
    case 'regular': return '盘中'
    case 'post': return '盘后'
    default: return '休市'
  }
}

export function isUsPreMarket(d = usNow()): boolean {
  return resolveUsQuoteSession(d) === 'pre'
}

export function isUsPostMarket(d = usNow()): boolean {
  return resolveUsQuoteSession(d) === 'post'
}
