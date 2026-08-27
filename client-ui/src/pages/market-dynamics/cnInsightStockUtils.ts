import type { InstrumentRef } from '../../types/instrument'
import {
  buildOpptrixInstrumentId,
  normalizeInstrumentRefLocal,
  tryParseInstrumentInput,
} from '../../market/instrument'
import { resolveCnInstrumentRef } from '@opptrix/shared/instrument-ref'
import { normalizeCode } from '../../market/format'

export type CnInsightStockPick = {
  code: string
  name: string
}

/** 明细列表点选图表 — 与右侧行情面板一致的 Opptrix 标的 ID */
export function cnInsightInstrumentFromCode(code: string): InstrumentRef {
  const trimmed = code.trim()
  if (!trimmed) {
    return { market: 'CN', assetClass: 'EQUITY', symbol: '000000', exchange: 'SZ' }
  }
  const parsed = tryParseInstrumentInput(trimmed)
  if (parsed) return normalizeInstrumentRefLocal(parsed)
  return normalizeInstrumentRefLocal(resolveCnInstrumentRef(trimmed))
}

export function cnInsightChartInputCode(ref: InstrumentRef): string {
  return buildOpptrixInstrumentId(ref)
}

export function insightStockCodeKey(code: string): string {
  const trimmed = code.trim()
  const parsed = tryParseInstrumentInput(trimmed)
  if (parsed) return buildOpptrixInstrumentId(normalizeInstrumentRefLocal(parsed))
  return normalizeCode(trimmed)
}
