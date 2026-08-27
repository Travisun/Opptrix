import type { AssetClass, InstrumentRef, Market } from './market-data.js'
import {
  buildInstrumentNamespace,
  buildOpptrixInstrumentId,
  normalizeInstrumentRef,
  parseCanonicalInstrumentInput,
  parseInstrumentNamespace,
  resolveCnInstrumentIdentity,
} from './instrument-symbol.js'

const MARKETS: Market[] = ['CN', 'US', 'HK', 'CRYPTO', 'JP', 'KR']
const ASSET_CLASSES: AssetClass[] = ['EQUITY', 'ETF', 'LOF', 'REIT', 'INDEX', 'FUND', 'CRYPTO_SPOT', 'CRYPTO_PERP']

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
  const marketRaw = String(row.market ?? '').trim().toUpperCase()
  const hasExplicitAsset = row.assetClass != null || row.asset_class != null
  const assetRaw = String(row.assetClass ?? row.asset_class ?? 'EQUITY').trim().toUpperCase()
  if (hasExplicitAsset && !isAssetClass(assetRaw)) return null
  const exchangeRaw = row.exchange != null ? String(row.exchange).trim() : ''
  const exchange = exchangeRaw || undefined
  const quote = row.quote != null ? String(row.quote) : undefined

  // 结构化对象（market + 裸码）优先：禁止只用 symbol 推断而丢掉 INDEX/FUND/REIT
  // symbol 含命名空间 / Opptrix ID（冒号）时仍走字符串解析
  if (symbolRaw && isMarket(marketRaw) && !symbolRaw.includes(':')) {
    const assetClass = isAssetClass(assetRaw) ? assetRaw : 'EQUITY'
    if (/\.(SH|SZ|BJ|HK|US|OF|TI)$/i.test(symbolRaw)) {
      const fromCanonical = parseCanonicalInstrumentInput(symbolRaw)
      if (fromCanonical) {
        return normalizeInstrumentRef({
          ...fromCanonical,
          market: marketRaw,
          assetClass: hasExplicitAsset ? assetClass : fromCanonical.assetClass,
          ...(exchange ? { exchange } : {}),
          ...(quote != null ? { quote } : {}),
        })
      }
    }
    return normalizeInstrumentRef({
      market: marketRaw,
      assetClass,
      symbol: symbolRaw,
      exchange,
      quote,
    })
  }

  if (symbolRaw) {
    const fromCanonical = parseCanonicalInstrumentInput(symbolRaw)
    if (fromCanonical) {
      if (hasExplicitAsset || exchange || isMarket(marketRaw)) {
        return normalizeInstrumentRef({
          ...fromCanonical,
          ...(isMarket(marketRaw) ? { market: marketRaw } : {}),
          ...(hasExplicitAsset ? { assetClass: assetRaw as AssetClass } : {}),
          ...(exchange ? { exchange } : {}),
          ...(quote != null ? { quote } : {}),
        })
      }
      return fromCanonical
    }
    const fromNs = parseInstrumentNamespace(symbolRaw)
    if (fromNs) return fromNs
  }

  if (!symbolRaw || !isMarket(marketRaw)) return null
  const assetClass = isAssetClass(assetRaw) ? assetRaw : 'EQUITY'
  return normalizeInstrumentRef({ market: marketRaw, assetClass, symbol: symbolRaw, exchange, quote })
}

/** Build InstrumentRef from flat API fields (POST body) */
export function instrumentRefFromParams(params: Record<string, unknown>): InstrumentRef | null {
  // 已传 instrument：只解析该字段；失败不得回退裸 code（避免 REIT/INDEX → EQUITY）
  if (params.instrument != null) {
    return parseInstrumentRef(params.instrument)
  }
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

/** 全局标的展示码 — OpptrixQuant 统一 ID（CN/US/HK）；其余市场回退命名空间 */
export function instrumentDisplayCode(ref: InstrumentRef): string {
  return buildOpptrixInstrumentId(normalizeInstrumentRef(ref))
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
  // 仅 6 位纯数字无歧义判为 A 股；1-5 位须经 instrument_search 消歧。
  return /^\d{6}$/.test(s)
}
