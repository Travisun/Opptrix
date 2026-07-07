import type { IndexRealtime, StockProfile, StockRealtime } from '../../../core/schema.js'
import { normalizeCode, safeFloat } from '../../../utils/helpers.js'
import { fromSinaListSymbol } from '../api/symbols.js'

export type ParsedHqLine = {
  key: string
  values: string[]
}

/** 解析 `hq_str_{symbol}_i` 逗号分隔扩展字段 */
export function parseSinaExtendedParts(line: string): string[] {
  const text = String(line ?? '').trim()
  if (!text) return []
  return text.split(',')
}

/** 从 jsvar.js 文本提取 `var key = value;` */
export function parseSinaJsVarNumber(text: string, key: string): number | null {
  const m = text.match(new RegExp(`var\\s+${key}\\s*=\\s*([\\d.]+)`))
  return m ? safeFloat(m[1]) : null
}

export function mapSinaExtendedProfile(
  code: string,
  parts: string[],
  jsvar = '',
): StockProfile | null {
  if (!parts.length) return null
  const bare = normalizeCode(code)
  const name = parts[22]?.trim() || undefined
  const industry = parts[34]?.trim() || undefined
  const conceptsRaw = parts[40]?.trim()
  const concepts = conceptsRaw
    ? conceptsRaw.split('|').map(s => s.trim()).filter(Boolean)
    : undefined
  const mktcapWan = safeFloat(parts[37])
  const totalShares = safeFloat(parts[7])
  const jsTotalCap = parseSinaJsVarNumber(jsvar, 'totalcapital')

  return {
    code: bare,
    name,
    industry,
    concepts,
    totalMarketCap: mktcapWan != null ? mktcapWan * 10000 : null,
    regCapital: jsTotalCap ?? totalShares,
  }
}

export function parseHqLine(line: string): ParsedHqLine | null {
  const m = line.match(/var hq_str_([^=]+)="([^"]*)"/)
  if (!m?.[2]) return null
  return { key: m[1], values: m[2].split(',') }
}

export function mapStockHqQuote(row: ParsedHqLine, fallbackCode = ''): StockRealtime | null {
  const v = row.values
  if (v.length < 10 || !v[0]) return null
  const price = safeFloat(v[3])
  const preClose = safeFloat(v[2])
  const code = fromSinaListSymbol(row.key) || normalizeCode(fallbackCode)
  return {
    code,
    name: v[0],
    price,
    open: safeFloat(v[1]),
    high: safeFloat(v[4]),
    low: safeFloat(v[5]),
    preClose,
    volume: safeFloat(v[8]),
    amount: safeFloat(v[9]),
    changePct: price != null && preClose
      ? Math.round(((price - preClose) / preClose) * 10000) / 100
      : null,
    pe: null,
    pb: null,
    turnoverRate: null,
  }
}

export function mapIndexHqQuote(row: ParsedHqLine, fallbackCode = ''): IndexRealtime | null {
  const v = row.values
  if (!v[0]) return null
  const code = fromSinaListSymbol(row.key) || normalizeCode(fallbackCode)
  if (row.key.startsWith('s_')) {
    return {
      code,
      name: v[0],
      price: safeFloat(v[1]),
      changePct: safeFloat(v[3]),
      open: null,
      high: null,
      low: null,
      preClose: null,
      volume: safeFloat(v[4]),
      amount: safeFloat(v[5]),
    }
  }
  const stock = mapStockHqQuote(row, fallbackCode)
  if (!stock) return null
  return {
    code: stock.code,
    name: stock.name,
    price: stock.price,
    changePct: stock.changePct,
    open: stock.open,
    high: stock.high,
    low: stock.low,
    preClose: stock.preClose,
    volume: stock.volume,
    amount: stock.amount,
  }
}

export function mapGlobalIndexHqQuote(row: ParsedHqLine, displayCode: string): Record<string, unknown> | null {
  const v = row.values
  if (!v.length) return null
  if (row.key.startsWith('gb_')) {
    return {
      code: displayCode,
      name: v[0] || displayCode,
      price: safeFloat(v[1]),
      changePct: safeFloat(v[2]),
      market: 'global',
    }
  }
  if (row.key.startsWith('rt_hk')) {
    return {
      code: displayCode,
      name: v[1] || displayCode,
      price: safeFloat(v[2]),
      changePct: safeFloat(v[9]),
      market: 'global',
    }
  }
  const price = safeFloat(v[1])
  const preClose = safeFloat(v[2] ?? v[1])
  return {
    code: displayCode,
    name: v[0] || displayCode,
    price,
    changePct: price != null && preClose
      ? Math.round(((price - preClose) / preClose) * 10000) / 100
      : safeFloat(v[3]),
    market: 'global',
  }
}
