import type { IndexRealtime, StockRealtime } from '../../../core/schema.js'
import { normalizeCode, safeFloat } from '../../../utils/helpers.js'
import { fromNeteaseCode } from '../api/symbols.js'

function pctFromQuote(item: Record<string, unknown>, price: number | null, preClose: number | null): number | null {
  const direct = safeFloat(item.percent ?? item.PERCENT ?? item.updownRate)
  if (direct != null) return direct
  if (price != null && preClose) {
    return Math.round(((price - preClose) / preClose) * 10000) / 100
  }
  return null
}

export function mapFeedQuote(item: Record<string, unknown>, fallbackCode: string): StockRealtime {
  const neteaseCode = String(item.code ?? item.CODE ?? '')
  const code = neteaseCode ? fromNeteaseCode(neteaseCode) : normalizeCode(fallbackCode)
  const price = safeFloat(item.price ?? item.PRICE)
  const preClose = safeFloat(item.yclose ?? item.YESTCLOSE ?? item.preClose)
  return {
    code,
    name: String(item.name ?? item.NAME ?? ''),
    price,
    open: safeFloat(item.open ?? item.OPEN),
    high: safeFloat(item.high ?? item.HIGH),
    low: safeFloat(item.low ?? item.LOW),
    preClose,
    volume: safeFloat(item.volume ?? item.VOLUME),
    amount: safeFloat(item.turnover ?? item.TURNOVER),
    changePct: pctFromQuote(item, price, preClose),
    pe: safeFloat(item.pe ?? item.PE),
    pb: null,
    turnoverRate: safeFloat(item.hs ?? item.HS),
  }
}

export function mapFeedIndexQuote(item: Record<string, unknown>, fallbackCode: string): IndexRealtime {
  const stock = mapFeedQuote(item, fallbackCode)
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
