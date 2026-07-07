import type { StockKline } from '../../../core/schema.js'
import { normalizeCode } from '../../../utils/helpers.js'

export function mapTencentKlineRows(code: string, rows: string[][]): StockKline[] | null {
  if (!rows.length) return null
  const mapped = rows.map(r => ({
    code: normalizeCode(code),
    date: r[0],
    open: Number(r[1]),
    close: Number(r[2]),
    high: Number(r[3]),
    low: Number(r[4]),
    volume: Number(r[5]) || 0,
    amount: 0,
    changePct: null,
    turnoverRate: null,
  } satisfies StockKline))
  return mapped.length ? mapped : null
}

export function filterKlineByRange(rows: StockKline[], start = '', end = ''): StockKline[] {
  const startKey = start.replace(/-/g, '').slice(0, 8)
  const endKey = end.replace(/-/g, '').slice(0, 8)
  return rows.filter(row => {
    const key = row.date.replace(/-/g, '')
    if (startKey && key < startKey) return false
    if (endKey && key > endKey) return false
    return true
  })
}
