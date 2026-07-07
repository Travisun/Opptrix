import type { StockKline } from '../../../core/schema.js'
import { normalizeCode, safeFloat } from '../../../utils/helpers.js'

type SinaKlineRow = {
  day?: string
  open?: string
  high?: string
  low?: string
  close?: string
  volume?: string
}

export function mapSinaKlineRows(rows: SinaKlineRow[], code: string): StockKline[] | null {
  const results: StockKline[] = []
  for (const row of rows) {
    const close = safeFloat(row.close)
    if (close == null || close <= 0) continue
    const open = safeFloat(row.open) ?? close
    results.push({
      code: normalizeCode(code),
      date: String(row.day ?? '').slice(0, 10),
      open,
      close,
      high: safeFloat(row.high) ?? close,
      low: safeFloat(row.low) ?? close,
      volume: safeFloat(row.volume) ?? 0,
      amount: 0,
      changePct: null,
      turnoverRate: null,
    })
  }
  return results.length ? results : null
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
