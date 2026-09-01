import type { InstrumentRef } from '../../types/instrument'
import {
  buildOpptrixInstrumentId,
  normalizeInstrumentRefLocal,
  tryParseInstrumentInput,
} from '../../market/instrument'

import { normalizeHkDisplayCode } from './hkMarketDynamicsModel'

export type HkInsightStockPick = {
  code: string
  name: string
}

export function hkInsightInstrumentFromCode(code: string): InstrumentRef {
  const trimmed = code.trim()
  if (!trimmed) {
    return { market: 'HK', assetClass: 'EQUITY', symbol: '00000', exchange: 'HK' }
  }
  const parsed = tryParseInstrumentInput(trimmed)
  if (parsed) return normalizeInstrumentRefLocal(parsed)
  return normalizeInstrumentRefLocal({
    market: 'HK',
    assetClass: 'EQUITY',
    symbol: normalizeHkDisplayCode(trimmed),
    exchange: 'HK',
  })
}

export function hkInsightChartInputCode(ref: InstrumentRef): string {
  return buildOpptrixInstrumentId(ref)
}
