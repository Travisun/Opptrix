import type { WatchlistItem } from '../types/market'
import type { DetailPanelKind, InstrumentRef, LocalInstrumentHit, Market } from '../types/instrument'
import { isCnEtfCode, normalizeCode } from './format'

const US_PREFIX = /^(US|NYSE|NASDAQ|AMEX):/i
const CRYPTO_PREFIX = /^(CRYPTO|BINANCE|OKX):/i
const HK_PREFIX = /^HK:/i

export function parseInstrumentInput(raw: string): InstrumentRef {
  const input = raw.trim()
  if (!input) {
    return { market: 'CN', assetClass: 'EQUITY', symbol: '000000' }
  }
  if (US_PREFIX.test(input)) {
    const sym = input.replace(US_PREFIX, '').toUpperCase().replace(/[^A-Z0-9.-]/g, '')
    return { market: 'US', assetClass: 'EQUITY', symbol: sym }
  }
  if (CRYPTO_PREFIX.test(input)) {
    const body = input.replace(CRYPTO_PREFIX, '').trim().toUpperCase()
    if (body.includes('/')) {
      const [base, quote] = body.split('/')
      return { market: 'CRYPTO', assetClass: 'CRYPTO_SPOT', symbol: base, quote }
    }
    if (body.includes('-')) {
      const [base, quote] = body.split('-')
      return { market: 'CRYPTO', assetClass: 'CRYPTO_SPOT', symbol: base, quote }
    }
    return { market: 'CRYPTO', assetClass: 'CRYPTO_SPOT', symbol: body, quote: 'USDT' }
  }
  if (HK_PREFIX.test(input)) {
    const sym = input.replace(HK_PREFIX, '').toUpperCase()
    return { market: 'HK', assetClass: 'EQUITY', symbol: sym }
  }
  if (/^\d+$/.test(input) && input.length <= 6) {
    const sym = normalizeCode(input)
    return {
      market: 'CN',
      assetClass: isCnEtfCode(sym) ? 'ETF' : 'EQUITY',
      symbol: sym,
    }
  }
  if (/^[A-Z][A-Z0-9.-]{0,11}$/.test(input.toUpperCase())) {
    return { market: 'US', assetClass: 'EQUITY', symbol: input.toUpperCase() }
  }
  if (input.includes('/') || input.includes('-')) {
    const sep = input.includes('/') ? '/' : '-'
    const [base, quote] = input.toUpperCase().split(sep)
    if (base && quote) {
      return { market: 'CRYPTO', assetClass: 'CRYPTO_SPOT', symbol: base, quote }
    }
  }
  return { market: 'CN', assetClass: 'EQUITY', symbol: normalizeCode(input) }
}

export function displayCodeFromInstrument(ref: InstrumentRef): string {
  if (ref.market === 'CRYPTO' && ref.quote) return `${ref.symbol}/${ref.quote}`
  if (ref.market === 'US' || ref.market === 'HK') return ref.symbol
  return normalizeCode(ref.symbol)
}

export function formatInstrumentLabel(ref: InstrumentRef): string {
  if (ref.market === 'CN') return ref.symbol
  if (ref.market === 'CRYPTO' && ref.quote) return `CRYPTO:${ref.symbol}/${ref.quote}`
  return `${ref.market}:${ref.symbol}`
}

export function instrumentKey(ref: InstrumentRef): string {
  const ex = ref.exchange ?? ''
  return `${ref.market}:${ref.assetClass}:${ref.symbol}${ex ? `:${ex}` : ''}${ref.quote ? `:${ref.quote}` : ''}`
}

export function resolveWatchlistInstrument(item: WatchlistItem): InstrumentRef {
  if (item.instrument) return item.instrument
  return parseInstrumentInput(item.code)
}

export function normalizeWatchlistItem(item: WatchlistItem): WatchlistItem {
  const instrument = item.instrument ?? parseInstrumentInput(item.code)
  const code = displayCodeFromInstrument(instrument)
  return {
    ...item,
    code,
    name: item.name?.trim() || code,
    industry: item.industry?.trim() || undefined,
    note: item.note?.trim() || undefined,
    addedPrice: item.addedPrice ?? null,
    instrument,
  }
}

export function watchlistItemKey(item: WatchlistItem): string {
  return instrumentKey(resolveWatchlistInstrument(item))
}

export function detailPanelKind(ref: InstrumentRef): DetailPanelKind {
  if (ref.market === 'US' || ref.market === 'HK') return 'us'
  if (ref.market === 'CRYPTO') return 'crypto'
  if (ref.market === 'CN' && ref.assetClass === 'ETF') return 'cn-etf'
  if (ref.market === 'CN') return 'cn-equity'
  return 'other'
}

export function marketDisplayName(market: Market): string {
  switch (market) {
    case 'CN': return 'A股'
    case 'US': return '美股'
    case 'HK': return '港股'
    case 'CRYPTO': return 'Crypto'
    default: return market
  }
}

export function hitToWatchlistItem(hit: LocalInstrumentHit): WatchlistItem {
  return normalizeWatchlistItem({
    code: hit.code,
    name: hit.name ?? hit.code,
    industry: `${marketDisplayName(hit.market)} · ${hit.assetClass}`,
    instrument: hit.instrument,
  })
}
