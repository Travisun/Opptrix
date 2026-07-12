import type { AssetClass, InstrumentRef, Market } from './market-data.js'
import {
  buildInstrumentNamespace,
  normalizeInstrumentRef,
  parseCanonicalInstrumentInput,
  parseInstrumentNamespace,
  resolveCnInstrumentIdentity,
} from './instrument-symbol.js'

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
  const symbolRaw = String(row.symbol ?? row.code ?? '').trim()
  if (symbolRaw) {
    const fromNs = parseInstrumentNamespace(symbolRaw)
    if (fromNs) return fromNs
  }
  const marketRaw = String(row.market ?? '').trim().toUpperCase()
  const symbol = symbolRaw
  if (!symbol || !isMarket(marketRaw)) return null
  const assetRaw = String(row.assetClass ?? row.asset_class ?? 'EQUITY').trim().toUpperCase()
  const assetClass = isAssetClass(assetRaw) ? assetRaw : 'EQUITY'
  const exchange = row.exchange != null ? String(row.exchange) : undefined
  const quote = row.quote != null ? String(row.quote) : undefined
  return normalizeInstrumentRef({ market: marketRaw, assetClass, symbol, exchange, quote })
}

/** Build InstrumentRef from flat API fields (POST body) */
export function instrumentRefFromParams(params: Record<string, unknown>): InstrumentRef | null {
  const nested = parseInstrumentRef(params.instrument)
  if (nested) return nested
  return parseInstrumentRef(params)
}

/**
 * 解析 A 股 InstrumentRef — 支持 Stock-index 命名空间（CN:SH.510300）、裸代码或 InstrumentRef 对象。
 * assetClass（EQUITY / ETF / INDEX）由 symbol + exchange 推导，与 capability 路由配合使用。
 */
export function resolveCnInstrumentRef(input: string | InstrumentRef): InstrumentRef {
  if (typeof input === 'object' && input != null && input.market) {
    return normalizeInstrumentRef(input)
  }
  const text = String(input).trim()
  const parsed = parseCanonicalInstrumentInput(text)
  if (parsed?.market === 'CN') return parsed
  return resolveCnInstrumentIdentity({ market: 'CN', assetClass: 'EQUITY', symbol: text })
}

/** @deprecated 使用 resolveCnInstrumentRef — ETF 与个股共用同一解析入口 */
export function resolveCnEtfRef(input: string | InstrumentRef): InstrumentRef {
  return resolveCnInstrumentRef(input)
}

/** Stable dedupe key — Stock-index 命名空间，不含 assetClass */
export function instrumentRefKey(ref: InstrumentRef): string {
  return buildInstrumentNamespace(ref)
}

/** 全局标的标识 — 与 Stock-index instrumentId / ref_label 一致 */
export function instrumentDisplayCode(ref: InstrumentRef): string {
  return buildInstrumentNamespace(ref)
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
  // 保守兜底：1-6 位数字都可能是 A 股（含省略前导 0 的短写），但 1-5 位存在跨市场歧义，
  // 调用方应用 isAmbiguousNumericCode 进一步判断并走 instrument_search 消歧。
  return /^\d{1,6}$/.test(s)
}
