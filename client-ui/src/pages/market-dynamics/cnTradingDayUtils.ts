import { research } from '../../api/client'

const calendarCache = new Map<number, Set<string>>()

/** Normalize API date to YYYY-MM-DD. */
export function normalizeTradeDate(input: string): string | null {
  const trimmed = input.trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed
  if (/^\d{8}$/.test(trimmed)) {
    return `${trimmed.slice(0, 4)}-${trimmed.slice(4, 6)}-${trimmed.slice(6, 8)}`
  }
  return null
}

function todayYmd(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

async function loadTradingDaysForYear(year: number): Promise<Set<string>> {
  const cached = calendarCache.get(year)
  if (cached) return cached
  const resp = await research.tradeCalendar(year)
  const days = new Set<string>()
  for (const row of resp.data?.items ?? []) {
    if (row.isTradeDay === false) continue
    const normalized = normalizeTradeDate(String(row.date ?? ''))
    if (normalized) days.add(normalized)
  }
  calendarCache.set(year, days)
  return days
}

async function tradingDaysAround(dateYmd: string): Promise<Set<string>> {
  const year = Number(dateYmd.slice(0, 4))
  const years = [year - 1, year, year + 1].filter(y => y >= 1990 && y <= 2100)
  const merged = new Set<string>()
  for (const y of years) {
    const days = await loadTradingDaysForYear(y)
    for (const d of days) merged.add(d)
  }
  return merged
}

/**
 * Last A-share trading day on or before target (inclusive).
 * Falls back to target when calendar unavailable.
 */
export async function resolveLastTradingDayOnOrBefore(targetYmd?: string): Promise<string> {
  const target = normalizeTradeDate(targetYmd ?? '') ?? todayYmd()
  try {
    const days = await tradingDaysAround(target)
    if (!days.size) return target
    const sorted = [...days].filter(d => d <= target).sort()
    if (sorted.length) return sorted[sorted.length - 1]!
    const future = [...days].sort()
    return future[0] ?? target
  } catch {
    return target
  }
}

/** Default history query date: last trading day on or before today. */
export async function defaultHotHistoryDate(): Promise<string> {
  return resolveLastTradingDayOnOrBefore(todayYmd())
}
