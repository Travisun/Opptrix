import type { InstrumentRef } from '@opptrix/shared'
import {
  buildOpptrixInstrumentId,
  instrumentDisplayCode,
  isAmbiguousNumericCode,
  normalizeInstrumentRef,
  parseCanonicalInstrumentInput,
  parseOpptrixInstrumentId,
} from '@opptrix/shared'
import { instrumentId } from '../core/instrument.js'
import type { WatchlistItem } from './models.js'

/** OpptrixQuant 统一 ID（CN:REIT:508000.SH 等） */
export function isOpptrixInstrumentCode(code: string): boolean {
  return parseOpptrixInstrumentId(String(code ?? '').trim()) != null
}

/** 展示/持久化 code：Opptrix ID 原样保留；旧项仍用命名空间 */
function watchlistCodeFromRef(item: Pick<WatchlistItem, 'code'>, instrument: InstrumentRef): string {
  const raw = String(item.code ?? '').trim()
  if (isOpptrixInstrumentCode(raw)) {
    return buildOpptrixInstrumentId(instrument)
  }
  return instrumentDisplayCode(instrument)
}

/** Stable dedupe key across markets — unresolved short codes use pending: prefix */
export function watchlistItemKey(item: Pick<WatchlistItem, 'code' | 'instrument'>): string {
  if (item.instrument?.market && item.instrument.symbol) {
    return instrumentId(item.instrument)
  }
  const parsed = parseCanonicalInstrumentInput(String(item.code ?? ''))
  if (parsed) return instrumentId(parsed)
  const opptrix = parseOpptrixInstrumentId(String(item.code ?? ''))
  if (opptrix) return instrumentId(normalizeInstrumentRef(opptrix))
  const raw = String(item.code ?? '').trim()
  return raw ? `pending:${raw}` : 'pending:'
}

export function displayCodeFromInstrument(ref: InstrumentRef): string {
  return instrumentDisplayCode(ref)
}

/**
 * Legacy code → InstrumentRef。歧义 1–5 位裸数字不再 pad 成 CN。
 * 无法权威解析时返回 null（调用方须搜索消歧或保留 pending）。
 */
export function tryLegacyToInstrument(code: string): InstrumentRef | null {
  const raw = code.trim()
  if (!raw) return null
  return parseCanonicalInstrumentInput(raw)
}

/**
 * @deprecated Prefer tryLegacyToInstrument / parseCanonicalInstrumentInput。
 * 空串仍返回哨兵；歧义短码抛错，禁止假 CN 占位。
 */
export function legacyToInstrument(code: string): InstrumentRef {
  const raw = code.trim()
  if (!raw) {
    return { market: 'CN', assetClass: 'EQUITY', symbol: '000000' }
  }
  const parsed = parseCanonicalInstrumentInput(raw)
  if (parsed) return parsed
  if (isAmbiguousNumericCode(raw)) {
    throw new Error(`Ambiguous instrument code requires search: ${raw}`)
  }
  throw new Error(`Unable to parse instrument code: ${raw}`)
}

export function normalizeWatchlistItem(item: WatchlistItem): WatchlistItem {
  if (item.instrument?.market && item.instrument.symbol) {
    const instrument = normalizeInstrumentRef(item.instrument)
    const code = watchlistCodeFromRef(item, instrument)
    return {
      code,
      name: item.name?.trim() || code,
      industry: item.industry?.trim() || undefined,
      note: item.note?.trim() || undefined,
      addedAt: item.addedAt,
      addedPrice: item.addedPrice ?? null,
      instrument,
    }
  }

  const opptrix = parseOpptrixInstrumentId(String(item.code ?? ''))
  if (opptrix) {
    const instrument = normalizeInstrumentRef(opptrix)
    const code = buildOpptrixInstrumentId(instrument)
    return {
      code,
      name: item.name?.trim() || code,
      industry: item.industry?.trim() || undefined,
      note: item.note?.trim() || undefined,
      addedAt: item.addedAt,
      addedPrice: item.addedPrice ?? null,
      instrument,
    }
  }

  const parsed = parseCanonicalInstrumentInput(String(item.code ?? ''))
  if (parsed) {
    const code = displayCodeFromInstrument(parsed)
    return {
      code,
      name: item.name?.trim() || code,
      industry: item.industry?.trim() || undefined,
      note: item.note?.trim() || undefined,
      addedAt: item.addedAt,
      addedPrice: item.addedPrice ?? null,
      instrument: parsed,
    }
  }

  const code = String(item.code ?? '').trim()
  return {
    code,
    name: item.name?.trim() || code,
    industry: item.industry?.trim() || undefined,
    note: item.note?.trim() || undefined,
    addedAt: item.addedAt,
    addedPrice: item.addedPrice ?? null,
    instrument: undefined,
  }
}
