import type { StockKline } from '../../../core/schema.js'
import { normalizeCode } from '../../../utils/helpers.js'

export function parseNeteaseKlineCsv(text: string, code: string): StockKline[] | null {
  const lines = text.trim().split('\n')
  if (lines.length < 2) return null
  const headers = lines[0].split(',')
  const idx = (name: string) => headers.findIndex(h => h.includes(name))
  const results: StockKline[] = []

  for (let i = 1; i < lines.length; i += 1) {
    const cols = lines[i].split(',')
    const close = Number(cols[idx('收盘价')] ?? cols[3])
    if (!close || close <= 0) continue
    results.push({
      code: normalizeCode(code),
      date: (cols[idx('日期')] ?? cols[0]).slice(0, 10),
      open: Number(cols[idx('开盘价')] ?? cols[1]) || close,
      close,
      high: Number(cols[idx('最高价')] ?? cols[4]) || close,
      low: Number(cols[idx('最低价')] ?? cols[5]) || close,
      volume: Number(cols[idx('成交量')] ?? cols[8]) || 0,
      amount: Number(cols[idx('成交金额')] ?? cols[9]) || 0,
      changePct: Number(cols[idx('涨跌幅')] ?? '') || null,
      turnoverRate: null,
    })
  }

  return results.length ? results : null
}
