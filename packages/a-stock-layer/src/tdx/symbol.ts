import { normalizeCode, resolveStockMarketCode, type StockMarket } from '../utils/helpers.js'

/** Map A-share code → nodetdx symbol (e.g. SH.600519, SZ.000002, BJ.920002) */
export function toTdxSymbol(code: string, market?: StockMarket | null): string {
  const c = normalizeCode(code)
  const m = market ?? resolveStockMarketCode(c)
  return `${m}.${c}`
}

export function isIndexCode(code: string): boolean {
  const c = normalizeCode(code)
  return (c.startsWith('000') && parseInt(c, 10) < 1000) || c.startsWith('399')
}
