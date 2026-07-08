import type { InstrumentRef } from '@opptrix/shared'
import { instrumentDisplayCode } from '@opptrix/shared'
import { inferCnAssetClass, instrumentId, toInstrumentRef } from '../core/instrument.js'
import { normalizeCode, resolveStockMarketCode } from '../utils/helpers.js'
import type { WatchlistItem } from './models.js'

/** Stable dedupe key across markets */
export function watchlistItemKey(item: Pick<WatchlistItem, 'code' | 'instrument'>): string {
  const ref = item.instrument ?? legacyToInstrument(String(item.code ?? ''))
  return instrumentId(ref)
}

export function displayCodeFromInstrument(ref: InstrumentRef): string {
  return instrumentDisplayCode(ref)
}

export function legacyToInstrument(code: string): InstrumentRef {
  const raw = code.trim()
  if (!raw) {
    return { market: 'CN', assetClass: 'EQUITY', symbol: '000000' }
  }
  if (/^(US|NYSE|NASDAQ|AMEX|CRYPTO|BINANCE|OKX|HK):/i.test(raw)) {
    return toInstrumentRef(raw)
  }
  if (/^\d+$/.test(raw) && raw.length <= 6) {
    const sym = normalizeCode(raw)
    return {
      market: 'CN',
      assetClass: inferCnAssetClass(sym),
      symbol: sym,
      exchange: resolveStockMarketCode(sym),
    }
  }
  return toInstrumentRef(raw)
}

export function normalizeWatchlistItem(item: WatchlistItem): WatchlistItem {
  const instrument = item.instrument ?? legacyToInstrument(String(item.code ?? ''))
  const code = displayCodeFromInstrument(instrument)
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
