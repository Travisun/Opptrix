import type { GlobalIndex } from '../../../core/schema.js'
import { parseYahooRealtime } from '../../../utils/yahoo-chart.js'
import { YFINANCE_GLOBAL_INDEX_MAP } from '../api/symbols.js'

export function mapYfinanceGlobalIndex(
  json: Record<string, unknown>,
  key: string,
  meta?: { name: string },
): GlobalIndex | null {
  const rows = parseYahooRealtime(json, key)
  const row = rows?.[0]
  if (!row) return null
  return {
    code: key,
    name: meta?.name ?? row.name ?? key,
    price: row.price,
    changePct: row.changePct,
    market: 'GLOBAL',
    timestamp: new Date().toISOString(),
  }
}

export function globalIndexKeys(code = ''): string[] {
  if (code.trim()) return [code.trim().toLowerCase()]
  return Object.keys(YFINANCE_GLOBAL_INDEX_MAP)
}
