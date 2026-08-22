import type { Time, UTCTimestamp } from 'lightweight-charts'
import { CN_TIMEZONE } from '../utils/cnTime'

const MINUTE_PERIODS = new Set(['1m', '5m', '15m', '30m', '60m'])

export function isMinuteOhlcPeriod(period: string): boolean {
  return MINUTE_PERIODS.has(period)
}

export function isIntradayPeriod(period: string): boolean {
  return period === 'intraday'
}

/** 主图左侧 pane 标签：分时 / 5 日折线 / 分钟 K 显示「分」，日周月年 K 显示「K」。 */
export function isLineChartPaneLabel(period: string): boolean {
  return isIntradayPeriod(period) || period === '5day' || isMinuteOhlcPeriod(period)
}

export function isOhlcPeriod(period: string): boolean {
  return period !== 'intraday'
}

/** Convert API time string → lightweight-charts Time (business day or UTC timestamp). */
export function toChartTime(value: string, forceTimestamp = false, timeZone?: string): Time {
  const v = value.trim()
  if (!v) return v.slice(0, 10)

  const hasClock = v.includes(' ') || v.includes('T')
  if (forceTimestamp || hasClock) {
    const normalized = v.includes('T') ? v : v.replace(' ', 'T')
    const withSec = normalized.length === 16 ? `${normalized}:00` : normalized
    const hasOffset = /[+-]\d{2}:\d{2}$/.test(withSec) || withSec.endsWith('Z')
    const withTz = hasOffset
      ? withSec
      : `${withSec}${timeZone ? timezoneOffsetSuffix(timeZone, withSec) : timezoneOffsetSuffix(CN_TIMEZONE, withSec)}`
    const ms = Date.parse(withTz)
    if (Number.isFinite(ms)) return Math.floor(ms / 1000) as UTCTimestamp
  }

  return v.slice(0, 10)
}

/** 日/周/月/年 K — 统一 BusinessDay，避免与 UTC 时间戳混用导致 X 轴错位。 */
export function toChartBusinessDay(value: string): Time | null {
  const v = value.trim()
  if (!v) return null

  if (/^\d{13}$/.test(v)) {
    const d = new Date(Number(v))
    if (Number.isNaN(d.getTime())) return null
    return { year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate() }
  }
  if (/^\d{10}$/.test(v)) {
    const d = new Date(Number(v) * 1000)
    if (Number.isNaN(d.getTime())) return null
    return { year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate() }
  }
  if (/^\d{8}$/.test(v)) {
    const year = Number(v.slice(0, 4))
    const month = Number(v.slice(4, 6))
    const day = Number(v.slice(6, 8))
    if (!year || month < 1 || month > 12 || day < 1 || day > 31) return null
    return { year, month, day }
  }

  const normalized = v.replace(/\//g, '-')
  const datePart = normalized.slice(0, 10)
  const m = datePart.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return null
  const year = Number(m[1])
  const month = Number(m[2])
  const day = Number(m[3])
  if (!year || month < 1 || month > 12 || day < 1 || day > 31) return null
  return { year, month, day }
}

export function isValidChartTime(time: Time): boolean {
  if (typeof time === 'number') return Number.isFinite(time) && time > 0
  if (typeof time === 'string') return /^\d{4}-\d{2}-\d{2}$/.test(time)
  return (
    time.year > 0
    && time.month >= 1 && time.month <= 12
    && time.day >= 1 && time.day <= 31
  )
}

export function timeSortKey(time: Time): number | string {
  if (typeof time === 'number') return time
  if (typeof time === 'string') return time
  return `${time.year}-${String(time.month).padStart(2, '0')}-${String(time.day).padStart(2, '0')}`
}

export function chartTimeForPeriod(raw: string, period: string, timeZone?: string): Time {
  if (isIntradayPeriod(period)) return toChartTime(raw, true, timeZone)
  if (period === '5day' && (raw.includes(' ') || raw.includes('T'))) return toChartTime(raw, true, timeZone)
  if (isMinuteOhlcPeriod(period)) return toChartTime(raw, true, timeZone)
  const businessDay = toChartBusinessDay(raw)
  if (businessDay) return businessDay
  return toChartTime(raw.slice(0, 10), false, timeZone)
}

function timezoneOffsetSuffix(timeZone: string, localIso: string): string {
  const datePart = localIso.slice(0, 10)
  const probe = new Date(`${datePart}T12:00:00Z`)
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    timeZoneName: 'shortOffset',
  }).formatToParts(probe)
  const raw = parts.find(part => part.type === 'timeZoneName')?.value ?? 'GMT'
  const match = raw.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/)
  if (!match) return '+08:00'
  const sign = match[1]
  const hours = match[2]!.padStart(2, '0')
  const mins = match[3] ?? '00'
  return `${sign}${hours}:${mins}`
}

export function compareChartTime(a: Time, b: Time): number {
  const ka = timeSortKey(a)
  const kb = timeSortKey(b)
  if (typeof ka === 'number' && typeof kb === 'number') return ka - kb
  return String(ka).localeCompare(String(kb))
}
