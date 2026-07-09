import type { WatchlistItem } from '../types/market'
import type { DetailPanelKind, InstrumentRef, LocalInstrumentHit, Market } from '../types/instrument'
import type { StockContext } from '../context/AppContext'
import { isCnEtfCode, isCnIndexCode, normalizeCode } from './format'

const US_PREFIX = /^(US|NYSE|NASDAQ|AMEX):/i
const CRYPTO_PREFIX = /^(CRYPTO|BINANCE|OKX):/i
const HK_PREFIX = /^HK:/i
const JP_PREFIX = /^JP:/i
const KR_PREFIX = /^KR:/i

/**
 * 裸数字代码跨市场歧义检测（与 @opptrix/shared 对齐）：
 * - 6 位纯数字 → A 股（无歧义）
 * - 1-5 位纯数字 → 可能是港股 5 位码、日韩代码、或省略前导 0 的 A 股短写，
 *   需要经 instrument_search 跨市场搜索消歧，不能直接判为 A 股。
 */
export function isUnambiguousCnDigits(raw: string): boolean {
  return /^\d{6}$/.test(raw.trim())
}

export function isAmbiguousNumericCode(raw: string): boolean {
  const s = raw.trim()
  return /^\d{1,5}$/.test(s)
}

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
    const sym = input.replace(HK_PREFIX, '').trim()
    const digits = sym.replace(/\D/g, '')
    const symbol = digits.length > 5 ? digits.slice(-5) : digits.padStart(5, '0')
    return { market: 'HK', assetClass: 'EQUITY', symbol, exchange: 'HK' }
  }
  if (JP_PREFIX.test(input)) {
    const sym = input.replace(JP_PREFIX, '').trim()
    const symbol = sym.replace(/\D/g, '') || sym.toUpperCase()
    return { market: 'JP', assetClass: 'EQUITY', symbol }
  }
  if (KR_PREFIX.test(input)) {
    const sym = input.replace(KR_PREFIX, '').trim()
    const digits = sym.replace(/\D/g, '')
    const symbol = digits ? digits.padStart(6, '0') : sym.toUpperCase()
    return { market: 'KR', assetClass: 'EQUITY', symbol }
  }
  // 6 位纯数字 → A 股（无歧义）。1-5 位数字仍兜底为 A 股以保持调用方非空约定，
  // 但入口（主搜索/聊天 @ 提及等）应先用 isAmbiguousNumericCode 判断，
  // 短码必须先走跨市场 instrument_search 获取带正确 market 的 ref。
  if (/^\d{6}$/.test(input)) {
    const sym = normalizeCode(input)
    const assetClass = isCnEtfCode(sym) ? 'ETF' : isCnIndexCode(sym) ? 'INDEX' : 'EQUITY'
    return { market: 'CN', assetClass, symbol: sym }
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
  // 短数字码兜底：不 padStart 到 6 位，保留原始长度作为 CN symbol，
  // 避免把 "700" 错当 "000700"（不存在的 A 股），让上层至少能看出异常。
  if (/^\d+$/.test(input)) {
    return { market: 'CN', assetClass: 'EQUITY', symbol: input }
  }
  return { market: 'CN', assetClass: 'EQUITY', symbol: normalizeCode(input) }
}

/**
 * 严格解析：可明确判定 market 的输入才返回 InstrumentRef；
 * 跨市场歧义（1-5 位纯数字等）返回 null，调用方应走 instrument_search 消歧。
 */
export function tryParseInstrumentInput(raw: string): InstrumentRef | null {
  const input = raw.trim()
  if (!input) return null
  // 带前缀 / 6 位纯数字 / 字母 ticker / crypto 对 → 复用 parseInstrumentInput 判定
  if (US_PREFIX.test(input) || CRYPTO_PREFIX.test(input) || HK_PREFIX.test(input)
    || JP_PREFIX.test(input) || KR_PREFIX.test(input)) {
    return parseInstrumentInput(input)
  }
  if (isUnambiguousCnDigits(input)) return parseInstrumentInput(input)
  if (/^[A-Z][A-Z0-9.-]{0,11}$/i.test(input) && !/^\d+$/.test(input)) {
    return parseInstrumentInput(input)
  }
  if ((input.includes('/') || input.includes('-'))
    && /^[A-Z0-9]+[\/\-][A-Z0-9]+$/i.test(input)) {
    return parseInstrumentInput(input)
  }
  // 1-5 位纯数字等歧义场景 → null，交给搜索层
  return null
}

/** CN A-share / ETF instrument ref from a bare code or alias string. */
export function cnEquityRef(code: string): InstrumentRef {
  return parseInstrumentInput(code)
}

export function displayCodeFromInstrument(ref: InstrumentRef): string {
  if (ref.market === 'CRYPTO' && ref.quote) return `${ref.symbol}/${ref.quote}`
  if (ref.market === 'CN') return normalizeCode(ref.symbol)
  return ref.symbol
}

/** @ 引用标签 — 与 @opptrix/shared instrumentRefLabel 保持一致 */
export function formatInstrumentLabel(ref: InstrumentRef): string {
  if (ref.market === 'CN') return normalizeCode(ref.symbol)
  if (ref.market === 'CRYPTO' && ref.quote) return `CRYPTO:${ref.symbol}/${ref.quote}`
  return `${ref.market}:${ref.symbol}`
}

export function isLikelyCnEquityInput(raw: string): boolean {
  const s = String(raw).trim()
  if (/^(US|HK|JP|KR|CRYPTO|NYSE|NASDAQ|AMEX|BINANCE|OKX):/i.test(s)) return false
  if (s.includes('/')) return false
  if (/^[A-Z][A-Z0-9.-]{0,11}$/i.test(s) && !/^\d+$/.test(s)) return false
  // 仅 6 位纯数字无歧义判为 A 股；1-5 位交由跨市场搜索消歧
  return isUnambiguousCnDigits(s)
}

/** 与 @opptrix/shared instrumentRefKey 保持一致：symbol → quote → exchange */
export function instrumentKey(ref: InstrumentRef): string {
  const quote = ref.quote ? `:${ref.quote}` : ''
  const exchange = ref.exchange ? `:${ref.exchange}` : ''
  return `${ref.market}:${ref.assetClass}:${ref.symbol}${quote}${exchange}`
}

function refToParseInput(ref: InstrumentRef): string {
  if (ref.market === 'CN') return ref.symbol
  if (ref.market === 'CRYPTO') {
    return ref.quote ? `${ref.symbol}/${ref.quote}` : ref.symbol
  }
  return `${ref.market}:${ref.symbol}`
}

/** 将 InstrumentRef 规范化为应用内 canonical 格式（与 shared normalizeInstrumentRef 对齐） */
export function normalizeInstrumentRefLocal(ref: InstrumentRef): InstrumentRef {
  return parseInstrumentInput(refToParseInput(ref))
}

export function resolveWatchlistInstrument(item: WatchlistItem): InstrumentRef {
  if (item.instrument) return item.instrument
  return parseInstrumentInput(item.code)
}

export function normalizeWatchlistItem(item: WatchlistItem): WatchlistItem {
  const instrument = normalizeInstrumentRefLocal(item.instrument ?? parseInstrumentInput(item.code))
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

export function toStockContext(
  item: WatchlistItem | Pick<WatchlistItem, 'code' | 'name' | 'instrument'>,
): StockContext {
  const normalized = normalizeWatchlistItem({
    code: item.code,
    name: item.name,
    instrument: item.instrument,
  })
  return {
    code: normalized.code,
    name: normalized.name,
    instrument: normalized.instrument,
  }
}

export function resolveStockContextInstrument(
  stock: Pick<StockContext, 'code' | 'instrument'> | null | undefined,
): InstrumentRef | null {
  if (!stock) return null
  if (stock.instrument) return stock.instrument
  const code = stock.code?.trim()
  if (!code) return null
  return parseInstrumentInput(code)
}

export function detailPanelKind(ref: InstrumentRef): DetailPanelKind {
  if (ref.market === 'CN' && ref.assetClass === 'ETF') return 'cn-etf'
  if (ref.market === 'CN') return 'cn-equity'
  if (ref.market === 'CRYPTO') return 'crypto'
  if (ref.market === 'US' || ref.market === 'HK' || ref.market === 'JP' || ref.market === 'KR') {
    return 'cross-market'
  }
  return 'cross-market'
}

export function marketDisplayName(market: Market): string {
  switch (market) {
    case 'CN': return 'A股'
    case 'US': return '美股'
    case 'HK': return '港股'
    case 'JP': return '日股'
    case 'KR': return '韩股'
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
