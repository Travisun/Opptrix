import { zipBaostockRows, type BaostockResult } from '../api/client.js'

function str(v: unknown): string {
  return v == null ? '' : String(v)
}

export function mapTradeCalendarRows(result: BaostockResult): Record<string, unknown>[] {
  return zipBaostockRows(result).map(row => ({
    date: str(row.calendar_date ?? row.date).slice(0, 10),
    isOpen: str(row.is_trading_day ?? row.isTradingDay) === '1',
    exchange: 'SSE',
  }))
}

export function filterTradeCalendarYear(rows: Record<string, unknown>[], year?: number): Record<string, unknown>[] {
  if (!year) return rows
  const prefix = String(year)
  return rows.filter(r => str(r.date).startsWith(prefix))
}
