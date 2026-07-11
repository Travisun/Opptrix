import type { WatchlistItem } from '../types/market'
import type { DetailPanelKind, InstrumentRef, LocalInstrumentHit, Market } from '../types/instrument'
import type { StockContext } from '../context/AppContext'
import { inferCnExchangeFromCode, isCnEtfCode, normalizeCode } from './format'

function inferCnAssetClass(code: string, exchange: 'SH' | 'SZ' | 'BJ'): InstrumentRef['assetClass'] {
  const c = normalizeCode(code)
  if (isCnEtfCode(c)) return 'ETF'
  if (exchange === 'SZ') return c.startsWith('399') ? 'INDEX' : 'EQUITY'
  if (exchange === 'SH') return (c.startsWith('000') && c.length === 6) ? 'INDEX' : 'EQUITY'
  return 'EQUITY'
}

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

const CN_EXCHANGE_PREFIX = /^(SH|SZ|BJ):(\d{6})$/i
const CN_DOT_SUFFIX = /^(\d{6})\.(SH|SZ|BJ)$/i
const CN_NAMESPACE = /^CN:(SH|SZ|BJ)[.:](\d{6})$/i
const US_NAMESPACE = /^US:(?:(NYSE|NASDAQ|AMEX)\.)?([A-Z0-9.-]+)$/i
const HK_NAMESPACE = /^HK:(\d{5})$/i
const CRYPTO_NAMESPACE = /^CRYPTO:(?:(BINANCE|OKX)\.)?([A-Z0-9]+)\/([A-Z0-9]+)$/i

/** Stock-index 统一命名空间 — 与 @opptrix/shared buildInstrumentNamespace 对齐 */
export function buildInstrumentNamespace(ref: InstrumentRef): string {
  const n = normalizeInstrumentRefLocal(ref)
  if (n.market === 'CN') {
    const ex = (n.exchange ?? inferCnExchangeFromCode(n.symbol)).toUpperCase()
    return `CN:${ex}.${n.symbol}`
  }
  if (n.market === 'HK') return `HK:${n.symbol}`
  if (n.market === 'US') {
    const ex = n.exchange?.toUpperCase()
    if (ex && (ex === 'NYSE' || ex === 'NASDAQ' || ex === 'AMEX')) {
      return `US:${ex}.${n.symbol}`
    }
    return `US:${n.symbol}`
  }
  if (n.market === 'CRYPTO') {
    const quote = n.quote ?? 'USDT'
    const ex = (n.exchange ?? 'BINANCE').toUpperCase()
    return `CRYPTO:${ex}.${n.symbol}/${quote}`
  }
  return `${n.market}:${n.symbol}`
}

function parseInstrumentNamespaceLocal(raw: string): InstrumentRef | null {
  const text = raw.trim()
  const cn = CN_NAMESPACE.exec(text)
  if (cn) {
    const sym = normalizeCode(cn[2]!)
    const exchange = cn[1]!.toUpperCase() as 'SH' | 'SZ' | 'BJ'
    return { market: 'CN', assetClass: inferCnAssetClass(sym, exchange), symbol: sym, exchange }
  }
  const us = US_NAMESPACE.exec(text)
  if (us) {
    return {
      market: 'US',
      assetClass: 'EQUITY',
      symbol: us[2]!.toUpperCase(),
      exchange: us[1]?.toUpperCase(),
    }
  }
  const hk = HK_NAMESPACE.exec(text)
  if (hk) {
    return { market: 'HK', assetClass: 'EQUITY', symbol: hk[1]!, exchange: 'HK' }
  }
  const crypto = CRYPTO_NAMESPACE.exec(text)
  if (crypto) {
    return {
      market: 'CRYPTO',
      assetClass: 'CRYPTO_SPOT',
      symbol: crypto[2]!.toUpperCase(),
      quote: crypto[3]!.toUpperCase(),
      exchange: crypto[1]?.toLowerCase() ?? 'binance',
    }
  }
  return null
}

export function parseInstrumentInput(raw: string): InstrumentRef {
  const input = raw.trim()
  if (!input) {
    return { market: 'CN', assetClass: 'EQUITY', symbol: '000000', exchange: 'SZ' }
  }

  const fromNamespace = parseInstrumentNamespaceLocal(input)
  if (fromNamespace) return fromNamespace

  const cnExPrefix = CN_EXCHANGE_PREFIX.exec(input)
  if (cnExPrefix) {
    const sym = normalizeCode(cnExPrefix[2]!)
    const exchange = cnExPrefix[1]!.toUpperCase() as 'SH' | 'SZ' | 'BJ'
    return { market: 'CN', assetClass: inferCnAssetClass(sym, exchange), symbol: sym, exchange }
  }
  const cnDotSuffix = CN_DOT_SUFFIX.exec(input)
  if (cnDotSuffix) {
    const sym = normalizeCode(cnDotSuffix[1]!)
    const exchange = cnDotSuffix[2]!.toUpperCase() as 'SH' | 'SZ' | 'BJ'
    return { market: 'CN', assetClass: inferCnAssetClass(sym, exchange), symbol: sym, exchange }
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
    const exchange = inferCnExchangeFromCode(sym)
    return { market: 'CN', assetClass: inferCnAssetClass(sym, exchange), symbol: sym, exchange }
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
    || JP_PREFIX.test(input) || KR_PREFIX.test(input) || CN_NAMESPACE.test(input)) {
    return parseInstrumentInput(input)
  }
  if (isUnambiguousCnDigits(input)) return parseInstrumentInput(input)
  if (/^[A-Z][A-Z0-9.-]{0,11}$/i.test(input) && !/^\d+$/.test(input)) {
    return parseInstrumentInput(input)
  }
  if ((input.includes('/') || input.includes('-'))
    && /^[A-Z0-9]+[/-][A-Z0-9]+$/i.test(input)) {
    return parseInstrumentInput(input)
  }
  // 1-5 位纯数字等歧义场景 → null，交给搜索层
  return null
}

/** 解析 API 请求用的 InstrumentRef — 优先保留已有 exchange */
export function resolveApiInstrumentRef(input: string | InstrumentRef): InstrumentRef {
  if (typeof input === 'object' && input != null && 'symbol' in input) {
    return normalizeInstrumentRefLocal(input)
  }
  return parseInstrumentInput(input)
}

/** CN A-share / ETF instrument ref — 支持传入完整 InstrumentRef（含 exchange） */
export function cnEquityRef(code: string | InstrumentRef): InstrumentRef {
  return resolveApiInstrumentRef(code)
}

export function displayCodeFromInstrument(ref: InstrumentRef): string {
  return buildInstrumentNamespace(ref)
}

/** @ 引用标签 — Stock-index 统一命名空间 */
export function formatInstrumentLabel(ref: InstrumentRef): string {
  return buildInstrumentNamespace(ref)
}

export function isLikelyCnEquityInput(raw: string): boolean {
  const s = String(raw).trim()
  if (/^(US|HK|JP|KR|CRYPTO|NYSE|NASDAQ|AMEX|BINANCE|OKX):/i.test(s)) return false
  if (s.includes('/')) return false
  if (/^[A-Z][A-Z0-9.-]{0,11}$/i.test(s) && !/^\d+$/.test(s)) return false
  // 仅 6 位纯数字无歧义判为 A 股；1-5 位交由跨市场搜索消歧
  return isUnambiguousCnDigits(s)
}

/** 与 @opptrix/shared instrumentRefKey 保持一致 — Stock-index 命名空间 */
export function instrumentKey(ref: InstrumentRef): string {
  return buildInstrumentNamespace(ref)
}

function refToParseInput(ref: InstrumentRef): string {
  if (ref.market === 'CN' && ref.exchange) {
    return `CN:${ref.exchange}.${normalizeCode(ref.symbol)}`
  }
  if (ref.market === 'CRYPTO') {
    return ref.quote ? `${ref.symbol}/${ref.quote}` : ref.symbol
  }
  return `${ref.market}:${ref.symbol}`
}

function normalizeCnInstrumentRef(ref: InstrumentRef): InstrumentRef {
  const sym = normalizeCode(ref.symbol)
  const exchange = (ref.exchange ?? inferCnExchangeFromCode(sym)).toUpperCase() as 'SH' | 'SZ' | 'BJ'
  return { market: 'CN', assetClass: inferCnAssetClass(sym, exchange), symbol: sym, exchange }
}

/** 将 InstrumentRef 规范化为应用内 canonical 格式（与 shared normalizeInstrumentRef 对齐） */
export function normalizeInstrumentRefLocal(ref: InstrumentRef): InstrumentRef {
  if (ref.market === 'CN') return normalizeCnInstrumentRef(ref)
  return parseInstrumentInput(refToParseInput(ref))
}

export function resolveWatchlistInstrument(item: WatchlistItem): InstrumentRef {
  if (item.instrument) return normalizeInstrumentRefLocal(item.instrument)
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
  if (stock.instrument) return normalizeInstrumentRefLocal(stock.instrument)
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
  const industry = hit.market === 'CN' && hit.exchange
    ? `${marketDisplayName(hit.market)} · ${hit.exchange === 'SH' ? '上交所' : hit.exchange === 'SZ' ? '深交所' : hit.exchange === 'BJ' ? '北交所' : hit.exchange}`
    : marketDisplayName(hit.market)
  return normalizeWatchlistItem({
    code: hit.code,
    name: hit.name ?? hit.code,
    industry,
    instrument: hit.instrument,
  })
}
