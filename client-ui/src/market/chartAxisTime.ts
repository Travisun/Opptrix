import { TickMarkType, type Time } from 'lightweight-charts'
import type { ChartPeriod } from '../types/market'
import { CN_TIMEZONE } from '../utils/cnTime'

function timeToDate(time: Time): Date | null {
  if (typeof time === 'number') return new Date(time * 1000)
  if (typeof time === 'string') {
    const ms = Date.parse(time)
    return Number.isFinite(ms) ? new Date(ms) : null
  }
  return null
}

function businessDay(time: Time): { year: number; month: number; day: number } | null {
  if (typeof time !== 'object' || time === null || !('year' in time)) return null
  return time as { year: number; month: number; day: number }
}

function quarterOf(month: number): number {
  return Math.floor((month - 1) / 3) + 1
}

function isMultiYearRange(period?: string): boolean {
  return period === 'year3' || period === 'year5'
}

export function createChartAxisFormatters(timeZone = CN_TIMEZONE, chartPeriod?: ChartPeriod) {
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
    const t = businessDay(time)
    if (t) {
      if (chartPeriod === 'yearly' || isMultiYearRange(chartPeriod)) {
        return String(t.year)
      }
      if (chartPeriod === 'quarterly') {
        return `${t.year}Q${quarterOf(t.month)}`
      }
      if (chartPeriod === 'year1') {
        return `${t.year}-${String(t.month).padStart(2, '0')}`
      }
      if (chartPeriod === 'monthly') {
        return `${t.year}-${String(t.month).padStart(2, '0')}`
      }
      return `${t.year}-${String(t.month).padStart(2, '0')}-${String(t.day).padStart(2, '0')}`
    }
    const d = timeToDate(time)
    return d ? formatClock(d, false) : String(time)
  }

  const tickMarkFormatter = (time: Time, tickMarkType: TickMarkType, _locale: string) => {
    const t = businessDay(time)
    if (t) {
      if (chartPeriod === 'yearly' || isMultiYearRange(chartPeriod)) {
        return String(t.year)
      }
      if (chartPeriod === 'quarterly') {
        const q = quarterOf(t.month)
        switch (tickMarkType) {
          case TickMarkType.Year:
            return String(t.year)
          case TickMarkType.Month:
            return `Q${q}`
          default:
            return `${t.year}Q${q}`
        }
      }
      if (chartPeriod === 'year1') {
        switch (tickMarkType) {
          case TickMarkType.Year:
            return String(t.year)
          case TickMarkType.Month:
            return `${t.month}月`
          default:
            return `${t.month}/${t.day}`
        }
      }
      if (chartPeriod === 'monthly') {
        switch (tickMarkType) {
          case TickMarkType.Year:
            return String(t.year)
          case TickMarkType.Month:
            return `${t.year}-${String(t.month).padStart(2, '0')}`
          default:
            return `${t.month}月`
        }
      }
      if (chartPeriod === 'weekly') {
        switch (tickMarkType) {
          case TickMarkType.Year:
            return String(t.year)
          case TickMarkType.Month:
            return `${t.month}月`
          default:
            return `${t.month}/${t.day}`
        }
      }
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
    if (chartPeriod === 'yearly' || isMultiYearRange(chartPeriod)) {
      return formatYear(d)
    }
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
