/** NYSE full-day closures — America/New_York calendar dates (YYYY-MM-DD). */

const CACHE = new Map<number, Set<string>>()

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function fmt(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** If holiday falls on Sat → Fri; Sun → Mon (NYSE observed). */
function observed(y: number, m: number, day: number): string {
  const d = new Date(Date.UTC(y, m - 1, day))
  const wd = d.getUTCDay()
  if (wd === 6) d.setUTCDate(d.getUTCDate() - 1)
  else if (wd === 0) d.setUTCDate(d.getUTCDate() + 1)
  return fmt(d)
}

function nthWeekday(y: number, month: number, weekday: number, n: number): string {
  const d = new Date(Date.UTC(y, month - 1, 1))
  let count = 0
  while (d.getUTCMonth() === month - 1) {
    if (d.getUTCDay() === weekday) {
      count++
      if (count === n) return fmt(d)
    }
    d.setUTCDate(d.getUTCDate() + 1)
  }
  throw new Error(`nthWeekday failed ${y}-${month}`)
}

function lastWeekday(y: number, month: number, weekday: number): string {
  const d = new Date(Date.UTC(y, month, 0))
  while (d.getUTCDay() !== weekday) d.setUTCDate(d.getUTCDate() - 1)
  return fmt(d)
}

/** Anonymous Gregorian Easter Sunday */
function easterSunday(y: number): Date {
  const a = y % 19
  const b = Math.floor(y / 100)
  const c = y % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31)
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return new Date(Date.UTC(y, month - 1, day))
}

function goodFriday(y: number): string {
  const e = easterSunday(y)
  e.setUTCDate(e.getUTCDate() - 2)
  return fmt(e)
}

function buildNyseHolidays(year: number): Set<string> {
  const out = new Set<string>()
  out.add(observed(year, 1, 1))
  out.add(nthWeekday(year, 1, 1, 3))
  out.add(nthWeekday(year, 2, 1, 3))
  out.add(goodFriday(year))
  out.add(lastWeekday(year, 5, 1))
  out.add(observed(year, 6, 19))
  out.add(observed(year, 7, 4))
  out.add(nthWeekday(year, 9, 1, 1))
  out.add(nthWeekday(year, 11, 4, 4))
  out.add(observed(year, 12, 25))
  return out
}

export function nyseHolidaysForYear(year: number): Set<string> {
  let set = CACHE.get(year)
  if (!set) {
    set = buildNyseHolidays(year)
    CACHE.set(year, set)
  }
  return set
}

export function isNyseHoliday(dateStr: string): boolean {
  const y = Number(dateStr.slice(0, 4))
  if (!Number.isFinite(y)) return false
  return nyseHolidaysForYear(y).has(dateStr)
}

export function isUsTradingDay(dateStr: string): boolean {
  const d = new Date(`${dateStr}T12:00:00Z`)
  const wd = d.getUTCDay()
  if (wd === 0 || wd === 6) return false
  return !isNyseHoliday(dateStr)
}
