/**
 * 轻量 5 段 cron（分 时 日 月 周）下次触发时间。
 * 支持 * /n 与列表/范围；不含秒字段与复杂 L/W/#。
 */

function parseField(
  raw: string,
  min: number,
  max: number,
): number[] | null {
  const text = raw.trim()
  if (!text) return null
  if (text === '*') {
    return Array.from({ length: max - min + 1 }, (_, i) => min + i)
  }
  const out = new Set<number>()
  for (const part of text.split(',')) {
    const stepMatch = /^(\*|\d+)(?:-(\d+))?\/(\d+)$/.exec(part)
    if (stepMatch) {
      const start = stepMatch[1] === '*' ? min : Number(stepMatch[1])
      const end = stepMatch[2] != null ? Number(stepMatch[2]) : max
      const step = Number(stepMatch[3])
      if (!Number.isFinite(start) || !Number.isFinite(end) || !Number.isFinite(step) || step <= 0) {
        return null
      }
      for (let v = start; v <= end; v += step) {
        if (v >= min && v <= max) out.add(v)
      }
      continue
    }
    const rangeMatch = /^(\d+)-(\d+)$/.exec(part)
    if (rangeMatch) {
      const a = Number(rangeMatch[1])
      const b = Number(rangeMatch[2])
      if (!Number.isFinite(a) || !Number.isFinite(b) || a > b) return null
      for (let v = a; v <= b; v++) {
        if (v >= min && v <= max) out.add(v)
      }
      continue
    }
    const n = Number(part)
    if (!Number.isFinite(n) || n < min || n > max) return null
    out.add(n)
  }
  return [...out].sort((a, b) => a - b)
}

export function parseCronExpression(expression: string): {
  minutes: number[]
  hours: number[]
  days: number[]
  months: number[]
  weekdays: number[]
} | null {
  const parts = expression.trim().split(/\s+/)
  if (parts.length !== 5) return null
  const minutes = parseField(parts[0], 0, 59)
  const hours = parseField(parts[1], 0, 23)
  const days = parseField(parts[2], 1, 31)
  const months = parseField(parts[3], 1, 12)
  const weekdays = parseField(parts[4], 0, 6)
  if (!minutes || !hours || !days || !months || !weekdays) return null
  return { minutes, hours, days, months, weekdays }
}

function matchesCron(
  d: Date,
  cron: NonNullable<ReturnType<typeof parseCronExpression>>,
): boolean {
  if (!cron.minutes.includes(d.getMinutes())) return false
  if (!cron.hours.includes(d.getHours())) return false
  if (!cron.months.includes(d.getMonth() + 1)) return false
  const dayOk = cron.days.includes(d.getDate())
  const wdOk = cron.weekdays.includes(d.getDay())
  // 标准：日与周同时非 * 时 OR；此处简化为均需匹配（常见 5 段实现用 OR 当两边都受限）
  const dayConstrained = cron.days.length < 31
  const wdConstrained = cron.weekdays.length < 7
  if (dayConstrained && wdConstrained) return dayOk || wdOk
  if (dayConstrained) return dayOk
  if (wdConstrained) return wdOk
  return true
}

/** 返回 from 之后（不含 from）的下一次触发 ISO 时间 */
export function nextCronOccurrence(expression: string, from: Date): Date | null {
  const cron = parseCronExpression(expression)
  if (!cron) return null
  const cursor = new Date(from.getTime())
  cursor.setSeconds(0, 0)
  cursor.setMinutes(cursor.getMinutes() + 1)
  // 最多向前扫 2 年分钟级
  const limit = 366 * 24 * 60 * 2
  for (let i = 0; i < limit; i++) {
    if (matchesCron(cursor, cron)) return new Date(cursor.getTime())
    cursor.setMinutes(cursor.getMinutes() + 1)
  }
  return null
}
