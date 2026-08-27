/**
 * client-ui 标的身份 — 权威解析一律委托 @opptrix/shared（方案 B）。
 * 本文件仅保留 UI 侧薄封装：关注列表 / StockContext / hit 映射等。
 */
import type { WatchlistItem } from '../types/market'
import type { DetailPanelKind, InstrumentRef, LocalInstrumentHit, Market } from '../types/instrument'
import type { StockContext } from '../context/AppContext'
import { isCnEtfCode, isCnListedFundSymbol, normalizeCode } from './format'
import {
  buildInstrumentNamespace as sharedBuildInstrumentNamespace,
  buildOpptrixInstrumentId,
  isAmbiguousNumericCode as sharedIsAmbiguousNumericCode,
  isUnambiguousCnDigits as sharedIsUnambiguousCnDigits,
  normalizeInstrumentRef,
  parseCanonicalInstrumentInput,
  parseInstrumentNamespace,
  parseOpptrixInstrumentId,
  resolveCnInstrumentIdentity,
  tryParseInstrumentInput as sharedTryParse,
} from '@opptrix/shared/instrument-symbol'
import {
  instrumentDisplayCode,
  instrumentRefKey,
  isLikelyCnEquityInput as sharedIsLikelyCnEquityInput,
} from '@opptrix/shared/instrument-ref'

export {
  buildOpptrixInstrumentId,
  parseInstrumentNamespace,
  parseCanonicalInstrumentInput,
  normalizeInstrumentRef,
  resolveCnInstrumentIdentity,
  parseOpptrixInstrumentId,
}

export const isUnambiguousCnDigits = sharedIsUnambiguousCnDigits
export const isAmbiguousNumericCode = sharedIsAmbiguousNumericCode
export const isLikelyCnEquityInput = sharedIsLikelyCnEquityInput
export const buildInstrumentNamespace = sharedBuildInstrumentNamespace

/** 严格解析 — 与 shared 权威一致；歧义短码返回 null */
export function tryParseInstrumentInput(raw: string): InstrumentRef | null {
  return sharedTryParse(raw) as InstrumentRef | null
}

/**
 * 非空解析：可权威判定时返回 InstrumentRef。
 * 歧义 1–5 位裸数字 **抛错**（禁止假 CN 占位）；调用方须 tryParse + 搜索消歧。
 */
export function parseInstrumentInput(raw: string): InstrumentRef {
  const input = raw.trim()
  if (!input) {
    return { market: 'CN', assetClass: 'EQUITY', symbol: '000000', exchange: 'SZ' }
  }
  const parsed = tryParseInstrumentInput(input)
  if (parsed) return parsed
  if (isAmbiguousNumericCode(input)) {
    throw new Error(`Ambiguous instrument code requires search: ${input}`)
  }
  throw new Error(`Unable to parse instrument input: ${input}`)
}

/** 解析 API 请求用的 InstrumentRef — 优先保留已有 exchange */
export function resolveApiInstrumentRef(input: string | InstrumentRef): InstrumentRef {
  if (typeof input === 'object' && input != null && 'symbol' in input) {
    return normalizeInstrumentRefLocal(input)
  }
  const parsed = tryParseInstrumentInput(input)
  if (parsed) return parsed
  throw new Error(`Unable to resolve instrument: ${String(input)}`)
}

/** CN A-share / ETF instrument ref — 支持传入完整 InstrumentRef（含 exchange） */
export function cnEquityRef(code: string | InstrumentRef): InstrumentRef {
  return resolveApiInstrumentRef(code)
}

export function displayCodeFromInstrument(ref: InstrumentRef): string {
  return instrumentDisplayCode(ref)
}

/** @ 引用标签 — OpptrixQuant 统一 ID（与搜索 / 关注列表 / 详情展示一致） */
export function formatInstrumentLabel(ref: InstrumentRef): string {
  return displayCodeFromInstrument(ref)
}

/** 与 @opptrix/shared instrumentRefKey 保持一致 — Stock-index 命名空间 */
export function instrumentKey(ref: InstrumentRef): string {
  return instrumentRefKey(ref)
}

/** 将 InstrumentRef 规范化为应用内 canonical 格式 */
export function normalizeInstrumentRefLocal(ref: InstrumentRef): InstrumentRef {
  return normalizeInstrumentRef(ref) as InstrumentRef
}

function inferMarketFromIndustry(industry: string | undefined): Market | null {
  const s = industry?.trim() ?? ''
  if (!s) return null
  if (/港股|香港|HKEX|\bHK\b/i.test(s)) return 'HK'
  if (/美股|纳斯达克|纽交所|NASDAQ|NYSE|AMEX|\bUS\b/i.test(s)) return 'US'
  if (/日股|\bJP\b|东证/i.test(s)) return 'JP'
  if (/韩股|\bKR\b/i.test(s)) return 'KR'
  if (/Crypto|加密/i.test(s)) return 'CRYPTO'
  if (/A股|上交所|深交所|北交所|公募基金/i.test(s)) return 'CN'
  return null
}

export function tryResolveWatchlistInstrument(item: WatchlistItem): InstrumentRef | null {
  if (item.instrument?.market && item.instrument.symbol) {
    // 拒绝历史假占位（不得进入行情/路由主路径）
    if (String(item.instrument.exchange ?? '').toUpperCase() === 'PENDING') {
      return null
    }
    return normalizeInstrumentRefLocal(item.instrument)
  }
  const rawCode = item.code.trim()
  const opptrix = parseOpptrixInstrumentId(rawCode)
  if (opptrix) {
    return normalizeInstrumentRefLocal(opptrix as InstrumentRef)
  }
  const industry = item.industry?.trim() ?? ''
  if (industry.includes('公募基金')) {
    const bare = normalizeCode(item.code.replace(/^CN:(?:PF|OF)[.:]/i, ''))
    return resolveCnInstrumentIdentity({
      market: 'CN',
      assetClass: 'FUND',
      symbol: bare,
      exchange: 'PF',
    }) as InstrumentRef
  }
  const parsed = tryParseInstrumentInput(item.code)
  if (parsed) return parsed

  if (isAmbiguousNumericCode(item.code.trim())) {
    const hint = inferMarketFromIndustry(item.industry)
    if (hint === 'HK') {
      return normalizeInstrumentRefLocal({
        market: 'HK',
        assetClass: 'EQUITY',
        symbol: item.code.trim(),
        exchange: 'HK',
      })
    }
    if (hint === 'US') {
      return normalizeInstrumentRefLocal({
        market: 'US',
        assetClass: 'EQUITY',
        symbol: item.code.trim(),
      })
    }
  }
  return null
}

/**
 * 解析关注项 InstrumentRef；未消歧短码返回 `null`（禁止构造可路由假身份）。
 * 调用方须跳过行情 / 提示用户重新搜索选定。
 */
export function resolveWatchlistInstrument(item: WatchlistItem): InstrumentRef | null {
  return tryResolveWatchlistInstrument(item)
}

/** 未消歧关注项 — 用户可见提示（ui-copy） */
export const UNRESOLVED_INSTRUMENT_COPY = {
  hint: '请重新搜索选定该标的',
  short: '需重新选定',
  listHint: '身份未确认，请在上方搜索并重新选定',
  ambiguousHint: '找到多个匹配，点选确认',
  ambiguousShort: '点选确认',
} as const

/** OpptrixQuant 搜索 / 入库用的统一 ID（CN:REIT:508000.SH 等） */
export function isOpptrixInstrumentCode(code: string): boolean {
  return parseOpptrixInstrumentId(code.trim()) != null
}

/**
 * 入库前：已解析身份强制对外 Opptrix ID；未消歧短码保留原样（pending）。
 */
export function prepareWatchlistItemForStore(item: WatchlistItem): WatchlistItem {
  const raw = item.code.trim()
  const fromOpptrix = isOpptrixInstrumentCode(raw) ? parseOpptrixInstrumentId(raw) : null
  const instrument = item.instrument?.market && item.instrument.symbol
    && String(item.instrument.exchange ?? '').toUpperCase() !== 'PENDING'
    ? normalizeInstrumentRefLocal(item.instrument)
    : fromOpptrix
      ? normalizeInstrumentRefLocal(fromOpptrix as InstrumentRef)
      : null

  if (instrument) {
    const code = buildOpptrixInstrumentId(instrument)
    return {
      ...item,
      code,
      name: item.name?.trim() || displayCodeFromInstrument(instrument),
      industry: item.industry?.trim() || undefined,
      note: item.note?.trim() || undefined,
      addedPrice: item.addedPrice ?? null,
      instrument,
    }
  }

  // 无显式身份时走权威解析（六位 A 股等）；仍歧义则 pending
  return normalizeWatchlistItem(item)
}

export function normalizeWatchlistItem(item: WatchlistItem): WatchlistItem {
  const resolved = tryResolveWatchlistInstrument(item)
  if (resolved) {
    const code = buildOpptrixInstrumentId(resolved)
    return {
      ...item,
      code,
      name: item.name?.trim() || displayCodeFromInstrument(resolved),
      industry: item.industry?.trim() || undefined,
      note: item.note?.trim() || undefined,
      addedPrice: item.addedPrice ?? null,
      instrument: resolved,
    }
  }
  // 歧义短码等：不发明假 CN，保留原 code（pending）
  const code = item.code.trim()
  return {
    ...item,
    code,
    name: item.name?.trim() || code,
    industry: item.industry?.trim() || undefined,
    note: item.note?.trim() || undefined,
    addedPrice: item.addedPrice ?? null,
    instrument: undefined,
  }
}

export function watchlistItemKey(item: WatchlistItem): string {
  const resolved = tryResolveWatchlistInstrument(item)
  if (resolved) return instrumentKey(resolved)
  const raw = item.code.trim()
  return raw ? `pending:${raw}` : 'pending:'
}

export function toStockContext(
  item: WatchlistItem | Pick<WatchlistItem, 'code' | 'name' | 'instrument'>,
): StockContext {
  const normalized = prepareWatchlistItemForStore({
    code: item.code,
    name: item.name,
    instrument: item.instrument,
  })
  // 已解析：code 为 Opptrix；pending 短码可无 instrument
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
  return tryParseInstrumentInput(code)
}

export function detailPanelKind(ref: InstrumentRef): DetailPanelKind {
  if (ref.market === 'CN' && ref.assetClass === 'INDEX') return 'cn-index'
  if (ref.market === 'CN' && (ref.assetClass === 'FUND' || ref.assetClass === 'REIT')) return 'cn-fund'
  if (ref.market === 'CN' && (ref.assetClass === 'ETF' || ref.assetClass === 'LOF')) return 'cn-etf'
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

/** 搜索候选副标题 — 市场 · 代码 · 类型 */
export function formatInstrumentSearchHitSubtitle(item: WatchlistItem): string {
  const ref = item.instrument ?? tryResolveWatchlistInstrument(item)
  const code = item.code.trim() || '—'
  if (!ref) return item.industry?.trim() || code

  const parts: string[] = [marketDisplayName(ref.market), code]
  if (ref.assetClass === 'ETF') {
    parts.push('ETF')
  } else if (ref.assetClass === 'LOF') {
    parts.push('LOF')
  } else if (ref.assetClass === 'REIT') {
    parts.push('REIT')
  } else if (ref.assetClass === 'FUND') {
    parts.push(isCnListedFundSymbol(ref.symbol) ? '场内基金' : '场外基金')
  } else if (ref.assetClass === 'INDEX') {
    parts.push('指数')
  } else if (ref.assetClass === 'CRYPTO_SPOT' || ref.assetClass === 'CRYPTO_PERP') {
    parts.push('Crypto')
  } else if (ref.market === 'CN' && ref.exchange) {
    const exLabel = ref.exchange === 'SH'
      ? '上交所'
      : ref.exchange === 'SZ'
        ? '深交所'
        : ref.exchange === 'BJ'
          ? '北交所'
          : ref.exchange
    parts.push(exLabel)
  }
  return parts.join(' · ')
}

/** 消歧候选展示：如「港股 00700 腾讯控股」 */
export function formatDisambiguationCandidateLabel(c: {
  instrument: InstrumentRef
  name: string | null
  code: string
}): string {
  const market = marketDisplayName(c.instrument.market)
  const sym = c.instrument.symbol
  const name = c.name?.trim()
  return name ? `${market} ${sym} ${name}` : `${market} ${sym}`
}


export function hitToWatchlistItem(hit: LocalInstrumentHit): WatchlistItem {
  const sym = normalizeCode(hit.instrument.symbol)
  const isListedEtf = isCnEtfCode(sym)
  const isFund = !isListedEtf
    && (hit.assetClass === 'FUND' || hit.exchange?.toUpperCase() === 'PF' || hit.exchange?.toUpperCase() === 'OF')
  const industry = isFund
    ? (isCnListedFundSymbol(sym) ? '公募基金 · 场内' : '公募基金 · 场外')
    : hit.market === 'CN' && hit.exchange
      ? `${marketDisplayName(hit.market)} · ${hit.exchange === 'SH' ? '上交所' : hit.exchange === 'SZ' ? '深交所' : hit.exchange === 'BJ' ? '北交所' : hit.exchange}`
      : marketDisplayName(hit.market)
  return prepareWatchlistItemForStore({
    code: hit.code,
    name: hit.name ?? hit.code,
    industry,
    instrument: hit.instrument,
  })
}
