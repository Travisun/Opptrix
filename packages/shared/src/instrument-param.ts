import type { InstrumentRef, Market } from './market-data.js'
import {
  instrumentRefFromParams,
  isLikelyCnEquityInput,
  isMarket,
  parseInstrumentRef,
} from './instrument-ref.js'
import {
  inferCnAssetClassFromSymbol,
  normalizeInstrumentRef,
  parseCanonicalInstrumentInput,
  parseInstrumentNamespace,
} from './instrument-symbol.js'

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

/** Resolve InstrumentRef from Hub/API params — supports instrument object, market+symbol, legacy code */
export function resolveInstrumentFromParams(params: Record<string, unknown>): InstrumentRef | null {
  const nested = instrumentRefFromParams(params)
  if (nested) return nested

  const rawCode = String(params.code ?? params.symbol ?? params.pair ?? '').trim()
  const exchangeRaw = params.exchange != null ? String(params.exchange).trim().toUpperCase() : undefined
  if (rawCode) {
    const parsed = parseCanonicalInstrumentInput(rawCode)
    if (parsed) return parsed

    const marketRaw = String(params.market ?? '').trim().toUpperCase()
    if (isMarket(marketRaw)) {
      const assetRaw = String(params.assetClass ?? params.asset_class ?? '').trim().toUpperCase()
      const base: InstrumentRef = marketRaw === 'CN'
        ? {
          market: 'CN',
          assetClass: assetRaw === 'ETF' || assetRaw === 'INDEX' ? assetRaw as InstrumentRef['assetClass'] : inferCnAssetClassFromSymbol(rawCode, exchangeRaw),
          symbol: rawCode,
          exchange: exchangeRaw,
        }
        : marketRaw === 'CRYPTO'
          ? {
            market: 'CRYPTO',
            assetClass: 'CRYPTO_SPOT',
            symbol: rawCode,
            quote: String(params.quote ?? 'USDT'),
            exchange: 'binance',
          }
          : {
            market: marketRaw,
            assetClass: 'EQUITY',
            symbol: rawCode,
          }
      return normalizeInstrumentRef(base)
    }

    if (isCryptoPairNotation(rawCode)) {
      return parseCanonicalInstrumentInput(rawCode)
    }
    if (isLikelyCnEquityInput(rawCode)) {
      return normalizeInstrumentRef({
        market: 'CN',
        assetClass: inferCnAssetClassFromSymbol(rawCode),
        symbol: rawCode,
      })
    }
    if (isLikelyUsTicker(rawCode)) {
      return normalizeInstrumentRef({ market: 'US', assetClass: 'EQUITY', symbol: rawCode })
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

/**
 * 统一顶层 InstrumentRef 解析 — InstrumentRef 对象、命名空间字符串或 Hub params。
 * 数据请求应经 queryInstrumentData(ref, capability) 而非按 assetClass 分叉 ref 解析器。
 */
export function resolveInstrumentRef(
  input: string | InstrumentRef | Record<string, unknown>,
): InstrumentRef | null {
  if (typeof input === 'object' && input != null) {
    if ('market' in input && typeof (input as InstrumentRef).market === 'string') {
      return normalizeInstrumentRef(input as InstrumentRef)
    }
    return resolveInstrumentFromParams(input as Record<string, unknown>)
  }
  const text = String(input).trim()
  if (!text) return null
  return parseCanonicalInstrumentInput(text)
}

export { instrumentProviderSymbol } from './instrument-symbol.js'
