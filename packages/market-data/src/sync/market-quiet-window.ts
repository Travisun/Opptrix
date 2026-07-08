/** 北京时间分量（Asia/Shanghai，无夏令时） */
export function beijingParts(date = new Date()): {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  weekday: number
} {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    weekday: 'short',
  })
  const parts = fmt.formatToParts(date)
  const pick = (type: string) => parts.find(p => p.type === type)?.value ?? ''
  const weekdayMap: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  }
  return {
    year: Number(pick('year')),
    month: Number(pick('month')),
    day: Number(pick('day')),
    hour: Number(pick('hour')),
    minute: Number(pick('minute')),
    weekday: weekdayMap[pick('weekday')] ?? 0,
  }
}

/**
 * 多市场均已收盘后的静默窗口（北京时间）：
 * - 工作日 05:30–07:00：美股已收、A/港股未开，适合全市场日 K 增量
 * - 周六 06:00–10:00：周末补跑
 */
export function isMultiMarketKlineQuietWindow(now = new Date()): boolean {
  const bj = beijingParts(now)
  const minutes = bj.hour * 60 + bj.minute

  if (bj.weekday === 6) {
    return minutes >= 6 * 60 && minutes < 10 * 60
  }
  if (bj.weekday === 0) return false

  const start = 5 * 60 + 30
  const end = 7 * 60
  return minutes >= start && minutes < end
}

/** 距下一静默窗口开始的毫秒数（用于调度器休眠） */
export function msUntilNextKlineQuietWindow(now = new Date()): number {
  if (isMultiMarketKlineQuietWindow(now)) return 0

  const bj = beijingParts(now)
  const utc = now.getTime()
  const bjNow = new Date(
    `${bj.year}-${String(bj.month).padStart(2, '0')}-${String(bj.day).padStart(2, '0')}T${String(bj.hour).padStart(2, '0')}:${String(bj.minute).padStart(2, '0')}:00+08:00`,
  )
  const offset = utc - bjNow.getTime()

  const target = new Date(bjNow)
  if (bj.weekday === 0) {
    target.setDate(target.getDate() + 1)
    target.setHours(5, 30, 0, 0)
  } else if (bj.weekday === 6) {
    if (bj.hour < 6) target.setHours(6, 0, 0, 0)
    else {
      target.setDate(target.getDate() + 2)
      target.setHours(5, 30, 0, 0)
    }
  } else if (bj.hour < 5 || (bj.hour === 5 && bj.minute < 30)) {
    target.setHours(5, 30, 0, 0)
  } else {
    target.setDate(target.getDate() + 1)
    target.setHours(5, 30, 0, 0)
    if (target.getDay() === 0) target.setDate(target.getDate() + 1)
    if (target.getDay() === 6) target.setDate(target.getDate() + 2)
  }

  return Math.max(60_000, target.getTime() + offset - utc)
}
