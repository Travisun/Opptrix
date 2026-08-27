import type { InstrumentRef } from '../../types/instrument'
import { inferCnExchangeFromCode, isCnEtfCode, normalizeCode } from '../../market/format'

export type CnInsightStockPick = {
  code: string
  name: string
}

export function cnInsightInstrumentFromCode(code: string): InstrumentRef {
  const symbol = normalizeCode(code)
  const exchange = inferCnExchangeFromCode(symbol)
  return {
    market: 'CN',
    assetClass: isCnEtfCode(symbol) ? 'ETF' : 'EQUITY',
    symbol,
    exchange,
  }
}

export function insightStockCodeKey(code: string): string {
  return normalizeCode(code)
}
