import { TickMarkType, type Time } from 'lightweight-charts'
import { CN_TIMEZONE } from '../utils/cnTime'

function timeToDate(time: Time): Date | null {
  if (typeof time === 'number') return new Date(time * 1000)
  if (typeof time === 'string') {
    const ms = Date.parse(time)
    return Number.isFinite(ms) ? new Date(ms) : null
  }
  return null
}

function businessDayLabel(time: Time): string | null {
  if (typeof time !== 'object' || time === null || !('year' in time)) return null
  const t = time as { year: number; month: number; day: number }
  return `${t.year}-${String(t.month).padStart(2, '0')}-${String(t.day).padStart(2, '0')}`
}

export function createChartAxisFormatters(timeZone = CN_TIMEZONE) {
  const formatClock = (d: Date, withSeconds: boolean) =>
    new Intl.DateTimeFormat('zh-CN', {
      timeZone,
      hour: '2-digit',
      minute: '2-digit',
      ...(withSeconds ? { second: '2-digit' } : {}),
      hour12: false,
    }).format(d)

  const formatMonthDay = (d: Date) =>
    new Intl.DateTimeFormat('zh-CN', {
      timeZone,
      month: 'numeric',
      day: 'numeric',
    }).format(d)

  const formatMonth = (d: Date) =>
    new Intl.DateTimeFormat('zh-CN', { timeZone, month: 'short' }).format(d)

  const formatYear = (d: Date) =>
    new Intl.DateTimeFormat('zh-CN', { timeZone, year: 'numeric' }).format(d)

  const timeFormatter = (time: Time) => {
    const day = businessDayLabel(time)
    if (day) return day
    const d = timeToDate(time)
    return d ? formatClock(d, false) : String(time)
  }

  const tickMarkFormatter = (time: Time, tickMarkType: TickMarkType, _locale: string) => {
    const day = businessDayLabel(time)
    if (day) {
      const t = time as { year: number; month: number; day: number }
      switch (tickMarkType) {
        case TickMarkType.Year:
          return String(t.year)
        case TickMarkType.Month:
          return `${t.year}-${String(t.month).padStart(2, '0')}`
        case TickMarkType.DayOfMonth:
          return `${t.month}/${t.day}`
        default:
          return `${t.month}/${t.day}`
      }
    }

    const d = timeToDate(time)
    if (!d) return null
    switch (tickMarkType) {
      case TickMarkType.Year:
        return formatYear(d)
      case TickMarkType.Month:
        return formatMonth(d)
      case TickMarkType.DayOfMonth:
        return formatMonthDay(d)
      case TickMarkType.Time:
        return formatClock(d, false)
      case TickMarkType.TimeWithSeconds:
        return formatClock(d, true)
      default:
        return formatClock(d, false)
    }
  }

  return { timeFormatter, tickMarkFormatter }
}
