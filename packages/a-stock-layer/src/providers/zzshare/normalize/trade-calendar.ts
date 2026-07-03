import { fmtYmd, pick, rowsFromPayload, str, type ZzshareRow } from './common.js'

function mapTradeDayRow(row: ZzshareRow | string): Record<string, unknown> | null {
  if (typeof row === 'string') {
    const date = fmtYmd(row)
    if (!date) return null
    return { date, isOpen: true, exchange: 'SSE' }
  }

  const date = fmtYmd(pick(row, 'date', 'calendar_date', 'trade_date', 'day', 'day_time'))
  if (!date) return null

  const openRaw = pick(row, 'is_open', 'is_trading_day', 'is_trade', 'isOpen', 'open')
  let isOpen = true
  if (openRaw != null && openRaw !== '') {
    const flag = str(openRaw).toLowerCase()
    isOpen = flag === '1' || flag === 'true' || flag === 'y' || flag === 'yes' || flag === 'open'
  }

  return {
    date,
    isOpen,
    exchange: str(pick(row, 'exchange', 'market')) || 'SSE',
  }
}

/** trade_days API → Opptrix trade calendar records. */
export function mapZzshareTradeCalendarRows(data: unknown): Record<string, unknown>[] {
  if (data == null) return []

  if (Array.isArray(data)) {
    const out: Record<string, unknown>[] = []
    for (const item of data) {
      if (typeof item === 'string') {
        const mapped = mapTradeDayRow(item)
        if (mapped) out.push(mapped)
      } else if (item && typeof item === 'object') {
        const mapped = mapTradeDayRow(item as ZzshareRow)
        if (mapped) out.push(mapped)
      }
    }
    return out
  }

  if (typeof data === 'object') {
    const obj = data as Record<string, unknown>
    const days = obj.days ?? obj.trade_days ?? obj.list
    if (Array.isArray(days)) return mapZzshareTradeCalendarRows(days)

    const rows = rowsFromPayload(data)
    if (rows.length) {
      return rows
        .map(row => mapTradeDayRow(row))
        .filter((row): row is Record<string, unknown> => row != null)
    }
  }

  return []
}

export function filterTradeCalendarYear(rows: Record<string, unknown>[], year?: number): Record<string, unknown>[] {
  if (!year) return rows
  const prefix = String(year)
  return rows.filter(r => str(r.date).startsWith(prefix))
}

export function latestOpenTradeDate(rows: Record<string, unknown>[], onOrBefore: string): string | null {
  const target = onOrBefore.slice(0, 10)
  const open = rows
    .filter(r => r.isOpen === true || str(r.isOpen) === 'true' || str(r.is_open) === '1')
    .map(r => str(r.date).slice(0, 10))
    .filter(d => d && d <= target)
    .sort()
  return open.length ? open[open.length - 1]! : null
}
