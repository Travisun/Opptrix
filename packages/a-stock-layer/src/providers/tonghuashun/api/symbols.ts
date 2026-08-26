import type { InstrumentRef } from '@opptrix/shared'
import {
  normalizeCode,
  parseStockMarket,
  resolveStockMarketCode,
  type StockMarket,
} from '../../../utils/helpers.js'

/**
 * Opptrix 裸码 → 扶摇 thscode。
 * 显式 exchange 优先；无 exchange 时 000001 默认 SZ（平安银行），与 inferCnExchangeFromSymbol 一致。
 * 上证指数须传 exchange=SH 或已带 `.SH` 后缀。
 */
export function toThsCode(code: string, exchange?: string | null): string {
  const dotted = /^(\d{6})\.(SH|SZ|BJ)$/i.exec(String(code).trim())
  if (dotted) return `${dotted[1]}.${dotted[2]!.toUpperCase()}`
  const c = normalizeCode(code)
  const ex = parseStockMarket(exchange) ?? resolveStockMarketCode(c)
  return `${c}.${ex}`
}

/** InstrumentRef → 扶摇 thscode（保留 exchange，禁止 resolveMarket 覆盖 SZ） */
export function toThsCodeFromRef(ref: Pick<InstrumentRef, 'symbol' | 'exchange'>): string {
  return toThsCode(ref.symbol, ref.exchange)
}

/** Fuyao thscode → 裸码 */
export function fromThsCode(thscode: string): string {
  const raw = String(thscode ?? '').trim()
  const dot = raw.lastIndexOf('.')
  if (dot <= 0) return normalizeCode(raw)
  return normalizeCode(raw.slice(0, dot))
}

/** Fuyao thscode → 交易所；无法解析时 null */
export function exchangeFromThsCode(thscode: string): StockMarket | null {
  const raw = String(thscode ?? '').trim()
  const m = /\.(SH|SZ|BJ)$/i.exec(raw)
  return m ? parseStockMarket(m[1]) : null
}

/** Standard A-share index thscode (000300 → 000300.SH) */
export function toIndexThsCode(code: string): string {
  const c = normalizeCode(code)
  if (c.includes('.')) return c.toUpperCase()
  if (c.startsWith('399') || c.startsWith('88')) return `${c}.${c.startsWith('399') ? 'SZ' : 'TI'}`
  return `${c}.SH`
}
