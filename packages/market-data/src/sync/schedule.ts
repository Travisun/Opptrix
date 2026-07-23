import { daysSince } from '../utils.js'

/** 名录 / 行业维护间隔（错开：二者至少相隔一周） */
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
 * A 股名录：每周至多一次；与行业错开（行业同步后 7 天内不跑名录）。
 */
export function cnUniverseMaintenanceDue(
  lastSync: Record<string, string | null>,
): boolean {
  if (!selfStale('initial_cn_universe', lastSync)) return false
  const taxLast = lastSync.initial_taxonomy ?? null
  if (taxLast && daysSince(taxLast) < CN_WEEKLY_MAINTENANCE_DAYS) return false
  return true
}

/**
 * A 股行业：每周至多一次；须晚于名录至少 7 天（与名录交替）。
 * 首次同步：名录完成后即可跑（bootstrap pipeline）。
 */
export function cnTaxonomyMaintenanceDue(
  lastSync: Record<string, string | null>,
): boolean {
  const taxLast = lastSync.initial_taxonomy ?? null
  if (!taxLast) {
    return !!(lastSync.initial_cn_universe ?? null)
  }
  if (!selfStale('initial_taxonomy', lastSync)) return false
  const uniLast = lastSync.initial_cn_universe ?? null
  if (!uniLast) return false
  if (daysSince(uniLast) < CN_WEEKLY_MAINTENANCE_DAYS) return false
  return true
}

/**
 * A 股日 K 增量：仅周一下午收盘后；每周至多一次。
 */
export function cnKlineDailyMaintenanceDue(
  lastSync: Record<string, string | null>,
  now = new Date(),
): boolean {
  if (!isCnMondayAfterMarketClose(now)) return false
  const last = lastSync.kline_daily ?? null
  if (!last) return true

  const lastAt = new Date(last)
  const nowBj = beijingClock(now)
  const lastBj = beijingClock(lastAt)
  const thisMonday = mondayDateKeyOfWeek(nowBj)
  const lastMonday = mondayDateKeyOfWeek(lastBj)

  // last 晚于 now 时不当成「本周已跑」（时钟漂移 / 脏数据防御）
  if (
    lastAt.getTime() <= now.getTime()
    && lastMonday === thisMonday
    && lastBj.hour >= CN_MARKET_CLOSE_HOUR
  ) {
    return false
  }
  return daysSince(last, now) >= CN_WEEKLY_MAINTENANCE_DAYS
}

/** 就绪后维护任务（名录 / 行业错开一周；日 K 周一收盘后） */
export function cnMaintenanceJobsDue(
  lastSync: Record<string, string | null>,
  now = new Date(),
): string[] {
  const jobs: string[] = []
  const universe = cnUniverseMaintenanceDue(lastSync)
  const taxonomy = cnTaxonomyMaintenanceDue(lastSync)

  if (universe && taxonomy) {
    const uniDays = daysSince(lastSync.initial_cn_universe ?? null)
    const taxDays = daysSince(lastSync.initial_taxonomy ?? null)
    jobs.push(uniDays >= taxDays ? 'initial_cn_universe' : 'initial_taxonomy')
  } else {
    if (universe) jobs.push('initial_cn_universe')
    if (taxonomy) jobs.push('initial_taxonomy')
  }

  if (cnKlineDailyMaintenanceDue(lastSync, now)) jobs.push('kline_daily')

  for (const job of ['initial_cn_etf', 'initial_hk_universe', 'initial_us_universe'] as const) {
    if (selfStale(job, lastSync)) jobs.push(job)
  }

  return jobs
}
