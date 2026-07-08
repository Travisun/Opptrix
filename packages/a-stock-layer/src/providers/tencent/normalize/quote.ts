import type { IndexRealtime, StockRealtime } from '../../../core/schema.js'
import { normalizeCode, safeFloat } from '../../../utils/helpers.js'

export function parseTencentLine(text: string): string[] | null {
  const start = text.indexOf('"')
  const end = text.lastIndexOf('"')
  if (start < 0 || end <= start) return null
  const parts = text.slice(start + 1, end).split('~')
  if (parts.length < 4 || !parts[3]) return null
  return parts
}

export function tencentChangePct(parts: string[]): number | null {
  if (parts.length >= 33) return safeFloat(parts[32])
  if (parts.length >= 14) return safeFloat(parts[13])
  return null
}

/** 腾讯行情总市值/流通市值字段单位为「亿元」→ 元 */
export function tencentMarketCapYuan(raw: string | undefined): number | null {
  const yi = safeFloat(raw)
  return yi != null ? yi * 1e8 : null
}

export function mapTencentRealtime(code: string, parts: string[]): StockRealtime {
  const f = (v: string | undefined) => safeFloat(v)
  return {
    code: normalizeCode(code),
    name: parts[1] ?? '',
    price: f(parts[3]),
    preClose: f(parts[4]),
    open: f(parts[5]),
    high: f(parts[33]),
    low: f(parts[34]),
    volume: f(parts[6]),
    amount: f(parts[37]),
    changePct: f(parts[32]),
    pe: f(parts[39]),
    pb: f(parts[46]),
    turnoverRate: f(parts[38]),
    volumeRatio: f(parts[49]),
    marketCap: tencentMarketCapYuan(parts[44]),
    circulatingMarketCap: tencentMarketCapYuan(parts[45]),
  }
}

export function mapTencentIndexFromParts(key: string, parts: string[]): IndexRealtime | null {
  const price = safeFloat(parts[3])
  if (price == null) return null
  return {
    code: key,
    name: parts[1] || key,
    price,
    changePct: tencentChangePct(parts),
  }
}
