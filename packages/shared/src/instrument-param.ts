import type { AssetClass, InstrumentRef, Market } from './market-data.js'
import {
  instrumentDisplayCode,
  instrumentRefFromParams,
  isLikelyCnEquityInput,
  isMarket,
  parseInstrumentRef,
} from './instrument-ref.js'

const MARKET_PREFIX = /^(CN|US|HK|JP|KR|CRYPTO|BINANCE|OKX|NYSE|NASDAQ|AMEX):(.+)$/i

function padCnSymbol(symbol: string): string {
  const s = symbol.trim()
  return /^\d+$/.test(s) ? s.padStart(6, '0') : s
}

function isCnEtfSymbol(symbol: string): boolean {
  const c = padCnSymbol(symbol)
  if (c.length !== 6) return false
  const head2 = c.slice(0, 2)
  const head3 = c.slice(0, 3)
  if (head2 === '51' || head2 === '52' || head2 === '56' || head2 === '58') return true
  if (head3 === '159' || head2 === '16') return true
  return false
}

function isCnIndexSymbol(symbol: string): boolean {
  const c = padCnSymbol(symbol)
  return c.startsWith('399')
    || (c.startsWith('000') && c.length === 6 && parseInt(c, 10) < 1000)
}

function inferCnAssetClass(symbol: string): AssetClass {
  const c = padCnSymbol(symbol)
  if (isCnIndexSymbol(c)) return 'INDEX'
  if (isCnEtfSymbol(c)) return 'ETF'
  return 'EQUITY'
}

function isCryptoPairNotation(raw: string): boolean {
  const s = raw.trim().toUpperCase()
  if (s.includes('/')) return true
  if (/^(CRYPTO|BINANCE|OKX):/i.test(s)) return true
  return /^[A-Z0-9]{2,12}-(USDT|USDC|USD|BTC|ETH|BNB)$/i.test(s)
}

function isLikelyUsTicker(raw: string): boolean {
  const s = raw.trim().toUpperCase()
  if (!s || s.length > 12) return false
  if (/^\d+$/.test(s)) return false
  return /^[A-Z][A-Z0-9.-]{0,11}$/.test(s)
}

function marketFromPrefix(prefix: string): Market {
  const p = prefix.toUpperCase()
  if (p === 'BINANCE' || p === 'OKX') return 'CRYPTO'
  if (p === 'NYSE' || p === 'NASDAQ' || p === 'AMEX') return 'US'
  return p as Market
}

function refFromPrefixedCode(raw: string): InstrumentRef | null {
  const m = raw.trim().match(MARKET_PREFIX)
  if (!m) return null
  const market = marketFromPrefix(m[1]!)
  const body = m[2]!.trim()
  if (!body) return null

  if (market === 'CRYPTO') {
    const pair = body.includes('/') ? body.split('/') : [body, 'USDT']
    const symbol = pair[0]!.trim().toUpperCase()
    const quote = (pair[1] ?? 'USDT').trim().toUpperCase()
    return { market: 'CRYPTO', assetClass: 'CRYPTO_SPOT', symbol, quote, exchange: 'binance' }
  }
  if (market === 'CN') {
    const symbol = padCnSymbol(body)
    return { market: 'CN', assetClass: inferCnAssetClass(symbol), symbol }
  }
  return { market, assetClass: 'EQUITY', symbol: body.toUpperCase() }
}

function refFromCryptoPair(raw: string): InstrumentRef | null {
  const s = raw.trim().toUpperCase()
  if (!isCryptoPairNotation(s)) return null
  if (s.includes('/')) {
    const [base, quote = 'USDT'] = s.split('/')
    return {
      market: 'CRYPTO',
      assetClass: 'CRYPTO_SPOT',
      symbol: base!.trim(),
      quote: quote.trim(),
      exchange: 'binance',
    }
  }
  if (s.includes('-')) {
    const [base, quote = 'USDT'] = s.split('-')
    return {
      market: 'CRYPTO',
      assetClass: 'CRYPTO_SPOT',
      symbol: base!.trim(),
      quote: quote.trim(),
      exchange: 'binance',
    }
  }
  return {
    market: 'CRYPTO',
    assetClass: 'CRYPTO_SPOT',
    symbol: s.replace(/USDT$|USDC$|USD$/i, '') || s,
    quote: 'USDT',
    exchange: 'binance',
  }
}

/** Resolve InstrumentRef from Hub/API params — supports instrument object, market+symbol, legacy code */
export function resolveInstrumentFromParams(params: Record<string, unknown>): InstrumentRef | null {
  const nested = instrumentRefFromParams(params)
  if (nested) return nested

  const rawCode = String(params.code ?? params.symbol ?? params.pair ?? '').trim()
  if (rawCode) {
    const prefixed = refFromPrefixedCode(rawCode)
    if (prefixed) return prefixed

    const marketRaw = String(params.market ?? '').trim().toUpperCase()
    if (isMarket(marketRaw)) {
      if (marketRaw === 'CRYPTO') {
        return refFromCryptoPair(rawCode) ?? {
          market: 'CRYPTO',
          assetClass: 'CRYPTO_SPOT',
          symbol: rawCode.toUpperCase(),
          quote: String(params.quote ?? 'USDT').toUpperCase(),
          exchange: 'binance',
        }
      }
      if (marketRaw === 'CN') {
        const symbol = padCnSymbol(rawCode)
        const assetRaw = String(params.assetClass ?? params.asset_class ?? '').trim().toUpperCase()
        const assetClass = assetRaw === 'ETF' || assetRaw === 'INDEX' ? assetRaw : inferCnAssetClass(symbol)
        return { market: 'CN', assetClass, symbol }
      }
      return {
        market: marketRaw,
        assetClass: 'EQUITY',
        symbol: rawCode.toUpperCase(),
      }
    }

    if (isCryptoPairNotation(rawCode)) return refFromCryptoPair(rawCode)
    if (isLikelyCnEquityInput(rawCode)) {
      const symbol = padCnSymbol(rawCode)
      return { market: 'CN', assetClass: inferCnAssetClass(symbol), symbol }
    }
    if (isLikelyUsTicker(rawCode)) {
      return { market: 'US', assetClass: 'EQUITY', symbol: rawCode.toUpperCase() }
    }
  }

  return parseInstrumentRef(params.instrument ?? params)
}

/** Batch resolve legacy code list → InstrumentRef[] (skips unresolvable entries) */
export function instrumentRefsFromList(
  list: unknown,
  defaultMarket: Market = 'CN',
): InstrumentRef[] {
  if (!Array.isArray(list)) return []
  const out: InstrumentRef[] = []
  for (const item of list) {
    if (typeof item === 'object' && item != null) {
      const ref = parseInstrumentRef(item)
      if (ref) out.push(ref)
      continue
    }
    const code = String(item ?? '').trim()
    if (!code) continue
    const ref = resolveInstrumentFromParams({ code })
      ?? (isLikelyCnEquityInput(code)
        ? resolveInstrumentFromParams({ code, market: defaultMarket })
        : null)
    if (ref) out.push(ref)
  }
  return out
}

/** Normalize legacy Hub params to instrument_* shape */
export function normalizeInstrumentHubParams(
  params: Record<string, unknown>,
): Record<string, unknown> {
  const ref = resolveInstrumentFromParams(params)
  if (!ref) return params
  return { ...params, instrument: ref }
}

/** Display/trading code for Engine provider calls */
export function instrumentProviderSymbol(ref: InstrumentRef): string {
  if (ref.market === 'CRYPTO') return instrumentDisplayCode(ref)
  if (ref.market === 'CN') return padCnSymbol(ref.symbol)
  return ref.symbol.trim().toUpperCase()
}
