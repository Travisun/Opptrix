import type { Time, UTCTimestamp } from 'lightweight-charts'

const MINUTE_PERIODS = new Set(['1m', '5m', '15m', '30m', '60m'])

export function isMinuteOhlcPeriod(period: string): boolean {
  return MINUTE_PERIODS.has(period)
}

export function isIntradayPeriod(period: string): boolean {
  return period === 'intraday'
}

export function isOhlcPeriod(period: string): boolean {
  return period !== 'intraday'
}

/** Convert API time string → lightweight-charts Time (business day or UTC timestamp). */
export function toChartTime(value: string, forceTimestamp = false): Time {
  const v = value.trim()
  if (!v) return v.slice(0, 10)

  const hasClock = v.includes(' ') || v.includes('T')
  if (forceTimestamp || hasClock) {
    const normalized = v.includes('T') ? v : v.replace(' ', 'T')
    const withSec = normalized.length === 16 ? `${normalized}:00` : normalized
    const withTz = withSec.includes('+') || withSec.endsWith('Z')
      ? withSec
      : `${withSec}+08:00`
    const ms = Date.parse(withTz)
    if (Number.isFinite(ms)) return Math.floor(ms / 1000) as UTCTimestamp
  }

  return v.slice(0, 10)
}

export function timeSortKey(time: Time): number | string {
  return typeof time === 'number' ? time : time
}

export function compareChartTime(a: Time, b: Time): number {
  const ka = timeSortKey(a)
  const kb = timeSortKey(b)
  if (typeof ka === 'number' && typeof kb === 'number') return ka - kb
  return String(ka).localeCompare(String(kb))
}
