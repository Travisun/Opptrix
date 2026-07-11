import { isBseCode, normalizeCode, parseStockMarket, resolveStockMarketCode } from '../../utils/helpers.js'

export function toTsCode(code: string, exchange?: string | null): string {
  const dotted = /^(\d{6})\.(SH|SZ|BJ)$/i.exec(String(code).trim())
  if (dotted) return `${dotted[1]}.${dotted[2]!.toUpperCase()}`
  const c = normalizeCode(code)
  const ex = parseStockMarket(exchange)
  if (ex) return `${c}.${ex}`
  if (isBseCode(c)) return `${c}.BJ`
  if (c.startsWith('399') || c.startsWith('159') || c.startsWith('16')) return `${c}.SZ`
  if (resolveStockMarketCode(c) === 'SH') return `${c}.SH`
  return `${c}.SZ`
}

export function fromTsCode(tsCode: string): string {
  return normalizeCode(tsCode.split('.')[0] ?? tsCode)
}

export function indexTsCode(code: string): string {
  const c = normalizeCode(code)
  if (c.startsWith('399')) return `${c}.SZ`
  if (c.startsWith('000') && c.length === 6) return `${c}.SH`
  return toTsCode(c)
}
