import type { AssetClass, InstrumentRef, Market } from './market-data.js'

const MARKETS: Market[] = ['CN', 'US', 'HK', 'CRYPTO', 'JP', 'KR']
const ASSET_CLASSES: AssetClass[] = ['EQUITY', 'ETF', 'INDEX', 'FUND', 'CRYPTO_SPOT', 'CRYPTO_PERP']

export function isMarket(v: string): v is Market {
  return (MARKETS as string[]).includes(v)
}

export function isAssetClass(v: string): v is AssetClass {
  return (ASSET_CLASSES as string[]).includes(v)
}

/** Parse InstrumentRef from hub/API params or stored JSON */
export function parseInstrumentRef(input: unknown): InstrumentRef | null {
  if (!input || typeof input !== 'object') return null
  const row = input as Record<string, unknown>
  const marketRaw = String(row.market ?? '').trim().toUpperCase()
  const symbol = String(row.symbol ?? row.code ?? '').trim()
  if (!symbol || !isMarket(marketRaw)) return null
  const assetRaw = String(row.assetClass ?? row.asset_class ?? 'EQUITY').trim().toUpperCase()
  const assetClass = isAssetClass(assetRaw) ? assetRaw : 'EQUITY'
  const exchange = row.exchange != null ? String(row.exchange) : undefined
  const quote = row.quote != null ? String(row.quote) : undefined
  return { market: marketRaw, assetClass, symbol, exchange, quote }
}

/** Build InstrumentRef from flat API fields (POST body) */
export function instrumentRefFromParams(params: Record<string, unknown>): InstrumentRef | null {
  const nested = parseInstrumentRef(params.instrument)
  if (nested) return nested
  return parseInstrumentRef(params)
}

/** Stable dedupe key — aligns with a-stock-layer instrumentId semantics */
export function instrumentRefKey(ref: InstrumentRef): string {
  const quote = ref.quote ? `:${ref.quote}` : ''
  const exchange = ref.exchange ? `:${ref.exchange}` : ''
  return `${ref.market}:${ref.assetClass}:${ref.symbol}${quote}${exchange}`
}

/** Display / map key for non-crypto cross-market symbols (no A-share zero pad) */
export function instrumentDisplayCode(ref: InstrumentRef): string {
  if (ref.market === 'CRYPTO' || ref.assetClass === 'CRYPTO_SPOT' || ref.assetClass === 'CRYPTO_PERP') {
    if (ref.symbol.includes('/')) return ref.symbol
    const quote = ref.quote ?? 'USDT'
    return `${ref.symbol}/${quote}`
  }
  if (ref.market === 'CN') return ref.symbol.padStart(6, '0')
  return ref.symbol
}

/** Legacy alias — prefer instrumentDisplayCode */
export function displayCodeFromInstrument(ref: InstrumentRef): string {
  return instrumentDisplayCode(ref)
}

export function isLikelyCnEquityInput(raw: string): boolean {
  const s = String(raw).trim()
  if (/^(US|HK|JP|KR|CRYPTO|NYSE|NASDAQ|AMEX|BINANCE|OKX):/i.test(s)) return false
  if (s.includes('/')) return false
  if (/^[A-Z][A-Z0-9.-]{0,11}$/i.test(s) && !/^\d+$/.test(s)) return false
  return /^\d{1,6}$/.test(s)
}
