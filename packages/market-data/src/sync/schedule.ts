import { daysSince } from '../utils.js'

/** 行业维护间隔 */
export const CN_WEEKLY_MAINTENANCE_DAYS = 7

/** A 股收盘（北京时间） */
export const CN_MARKET_CLOSE_HOUR = 15

export interface BeijingClock {
  /** 0=周日 … 1=周一 */
  dow: number
  hour: number
  minute: number
  /** YYYY-MM-DD（上海时区日历日） */
  dateKey: string
}

/** 当前北京时间分量（用于维护窗口判定） */
export function beijingClock(now = new Date()): BeijingClock {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    weekday: 'short',
  })
  const parts = Object.fromEntries(
    formatter.formatToParts(now).map(p => [p.type, p.value]),
  ) as Record<string, string>
  const dowMap: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  }
  return {
    dow: dowMap[parts.weekday] ?? 0,
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    dateKey: `${parts.year}-${parts.month}-${parts.day}`,
  }
}

/** 周一且已过 A 股收盘（15:00 北京时间） */
export function isCnMondayAfterMarketClose(now = new Date()): boolean {
  const { dow, hour, minute } = beijingClock(now)
  if (dow !== 1) return false
  return hour > CN_MARKET_CLOSE_HOUR
    || (hour === CN_MARKET_CLOSE_HOUR && minute >= 0)
}

function selfStale(
  job: string,
  lastSync: Record<string, string | null>,
  ttlDays = CN_WEEKLY_MAINTENANCE_DAYS,
): boolean {
  const last = lastSync[job] ?? null
  return !last || daysSince(last) >= ttlDays
}

/** 当周周一的日历日（上海时区，用于「本周是否已跑过日 K」） */
export function mondayDateKeyOfWeek(clock: BeijingClock): string {
  const [y, m, d] = clock.dateKey.split('-').map(Number)
  const utc = Date.UTC(y, m - 1, d)
  const day = new Date(utc).getUTCDay()
  const diffToMonday = day === 0 ? -6 : 1 - day
  const monday = new Date(utc + diffToMonday * 86400000)
  const yy = monday.getUTCFullYear()
  const mm = String(monday.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(monday.getUTCDate()).padStart(2, '0')
  return `${yy}-${mm}-${dd}`
}

/**
 * @deprecated 标的库名录同步已下线，恒为 false
 */
export function cnUniverseMaintenanceDue(
  _lastSync: Record<string, string | null>,
): boolean {
  return false
}

/** @deprecated 行业分类同步已下线，恒为 false */
export function cnTaxonomyMaintenanceDue(
  _lastSync: Record<string, string | null>,
): boolean {
  return false
}

/** 就绪后无自动维护任务 */
export function cnMaintenanceJobsDue(
  _lastSync: Record<string, string | null>,
  _now = new Date(),
): string[] {
  return []
}
