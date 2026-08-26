import type { AssetClass, InstrumentRef, Market } from './market-data.js'

const MARKET_PREFIX = /^(CN|US|HK|JP|KR|CRYPTO|BINANCE|OKX|NYSE|NASDAQ|AMEX):(.+)$/i

function stripMarketPrefix(raw: string): { market?: Market; body: string } {
  const m = raw.trim().match(MARKET_PREFIX)
  if (!m) return { body: raw.trim() }
  const prefix = m[1]!.toUpperCase()
  if (prefix === 'BINANCE' || prefix === 'OKX') return { market: 'CRYPTO', body: m[2]!.trim() }
  if (prefix === 'NYSE' || prefix === 'NASDAQ' || prefix === 'AMEX') return { market: 'US', body: m[2]!.trim() }
  return { market: prefix as Market, body: m[2]!.trim() }
}

/** A 股 6 位代码（仅数字段） */
export function canonicalCnSymbol(symbol: string): string {
  const digits = symbol.trim().replace(/\D/g, '').slice(-6)
  return digits.padStart(6, '0')
}

/**
 * 裸数字代码存在跨市场歧义：A 股固定 6 位，港股为 5 位（含前导 0），
 * 日韩也使用 4-6 位数字。只有输入为精确 6 位纯数字时才能无歧义判为 A 股；
 * 1-5 位数字需要上层经 instrument_search 跨市场搜索消歧，不能本地直接归 CN。
 */
export function isUnambiguousCnDigits(raw: string): boolean {
  return /^\d{6}$/.test(raw.trim())
}

/** 1-5 位纯数字 — 可能是港股（00700）、日韩股票、或省略前导 0 的 A 股简写，需要搜索消歧 */
export function isAmbiguousNumericCode(raw: string): boolean {
  const s = raw.trim()
  return /^\d{1,5}$/.test(s)
}

/** 美股 ticker — 大写、去交易所前缀 */
export function canonicalUsSymbol(symbol: string): string {
  let s = symbol.trim().toUpperCase().replace(/^(US|NYSE|NASDAQ|AMEX):/i, '')
  s = s.replace(/[^A-Z0-9.-]/g, '')
  return s
}

/** 港股 5 位代码（如 00700） */
export function canonicalHkSymbol(symbol: string): string {
  const raw = symbol.trim().toUpperCase().replace(/^HK:/i, '')
  const digits = raw.replace(/\D/g, '')
  if (!digits) return raw
  return digits.length > 5 ? digits.slice(-5) : digits.padStart(5, '0')
}

/** 日股数字代码（如 7203） */
export function canonicalJpSymbol(symbol: string): string {
  const raw = symbol.trim().toUpperCase().replace(/^JP:/i, '')
  return raw.replace(/\D/g, '') || raw
}

/** 韩股 6 位代码（如 005930） */
export function canonicalKrSymbol(symbol: string): string {
  const raw = symbol.trim().toUpperCase().replace(/^KR:/i, '')
  const digits = raw.replace(/\D/g, '')
  return digits ? digits.padStart(6, '0') : raw
}

/** Crypto base/quote 大写规范化 */
export function canonicalCryptoParts(symbol: string, quote?: string): { symbol: string; quote: string } {
  const body = symbol.trim().toUpperCase()
  if (body.includes('/')) {
    const [base, q = 'USDT'] = body.split('/')
    return { symbol: base!.trim(), quote: q.trim() }
  }
  if (body.includes('-')) {
    const [base, q = 'USDT'] = body.split('-')
    return { symbol: base!.trim(), quote: q.trim() }
  }
  return {
    symbol: body.replace(/[^A-Z0-9]/g, '') || body,
    quote: (quote ?? 'USDT').trim().toUpperCase(),
  }
}

function isCnEtfSymbol(symbol: string): boolean {
  const c = canonicalCnSymbol(symbol)
  if (isCnLofSymbol(c)) return false
  const head2 = c.slice(0, 2)
  const head3 = c.slice(0, 3)
  if (head2 === '51' || head2 === '52' || head2 === '56' || head2 === '58') return true
  if (head3 === '159') return true
  return false
}

/** 场内 LOF（16xxxx，不含 159xxx ETF 段） */
export function isCnLofSymbol(symbol: string): boolean {
  const c = canonicalCnSymbol(symbol)
  return c.length === 6 && c.startsWith('16') && !c.startsWith('159')
}

/**
 * 无 exchange 时可安全判为上证指数的常见代码（不含 000001 — 默认深市平安银行）。
 * 其余 000xxx（如 000977 浪潮信息）默认深市个股，避免与上证同名指数混淆。
 */
const SH_CN_INDEX_CODES = new Set([
  '000016', '000300', '000688', '000905', '000906', '000985',
])

/** 常见上证指数白名单（供无 exchange 场景消歧） */
export function isKnownShCnIndexCode(symbol: string): boolean {
  return SH_CN_INDEX_CODES.has(canonicalCnSymbol(symbol))
}

/**
 * A 股指数代码段识别（纯代码段推断，主要用于无 exchange 的场景）。
 * - 深证 399xxx → 指数
 * - 常见上证 000xxx 白名单 → 指数
 * - 其余 000xxx（000002–000999 深市个股段）→ 非指数
 */
function isCnIndexSymbol(symbol: string): boolean {
  const c = canonicalCnSymbol(symbol)
  if (c.startsWith('399') || c.startsWith('88')) return true
  return isKnownShCnIndexCode(c)
}

/**
 * 判断 A 股代码是否为指数，支持 exchange 消歧。
 * SH 市场 000xxx 均为指数；SZ 市场 000xxx 均为个股（399xxx 为深证指数）。
 */
export function isCnIndexSymbolByExchange(symbol: string, exchange?: string | null): boolean {
  const c = canonicalCnSymbol(symbol)
  if (c.startsWith('399') || c.startsWith('88')) return true
  const ex = exchange?.toUpperCase()
  if (ex === 'TI') return true
  if (ex === 'SZ') return false
  if (ex === 'SH') {
    return c.startsWith('000') && c.length === 6
  }
  return isKnownShCnIndexCode(c)
}

/** A 股交易所 — CN 标的内部身份的一部分，与 symbol 共同消歧 */
export type CnExchange = 'SH' | 'SZ' | 'BJ' | 'OF' | 'PF' | 'TI'

/**
 * 无 exchange 时从代码段推断交易所（兜底，非权威）。
 * 同码异名（如 000977）须由搜索/用户选择带回 exchange，不可仅靠此推断。
 */
export function inferCnExchangeFromSymbol(symbol: string): CnExchange {
  const c = canonicalCnSymbol(symbol)
  if (c.startsWith('92') || c.startsWith('43') || c.startsWith('83') || c.startsWith('87')) return 'BJ'
  if (c.startsWith('399')) return 'SZ'
  if (c.startsWith('88')) return 'TI'
  // 上证 ETF 代码段（51/52/56/58）；深证 ETF 为 159xxx / 16xxxx，走下方默认
  const head2 = c.slice(0, 2)
  if (head2 === '51' || head2 === '52' || head2 === '56' || head2 === '58') return 'SH'
  if (c.startsWith('6')) return 'SH'
  if (c.startsWith('9')) return 'SH'
  if (c.startsWith('3') || c.startsWith('2')) return 'SZ'
  if (c === '000001') return 'SZ'
  if (isKnownShCnIndexCode(c)) return 'SH'
  if (c.startsWith('0')) return 'SZ'
  return 'SZ'
}

/**
 * 解析 CN 标的完整身份 — exchange 优先，assetClass 由 exchange + 代码段推导。
 * 搜索命中、关注列表、Hub API 应始终传递并保留 exchange。
 */
export function resolveCnInstrumentIdentity(ref: InstrumentRef): InstrumentRef {
  const symbol = canonicalCnSymbol(ref.symbol)
  const ac = ref.assetClass

  if (ac === 'FUND' || ref.exchange?.toUpperCase() === 'PF' || ref.exchange?.toUpperCase() === 'OF') {
    if (isCnEtfSymbol(symbol)) {
      return { market: 'CN', assetClass: 'ETF', symbol, exchange: inferCnExchangeFromSymbol(symbol) }
    }
    if (isCnLofSymbol(symbol)) {
      return { market: 'CN', assetClass: 'LOF', symbol, exchange: inferCnExchangeFromSymbol(symbol) }
    }
    return { market: 'CN', assetClass: 'FUND', symbol, exchange: 'PF' }
  }
  if (ac === 'REIT') {
    const exRaw = ref.exchange?.toUpperCase()
    const exchange = (exRaw && exRaw !== 'PF' && exRaw !== 'OF' && exRaw !== 'TI')
      ? exRaw as CnExchange
      : inferCnExchangeFromSymbol(symbol)
    return { market: 'CN', assetClass: 'REIT', symbol, exchange }
  }
  if (ac === 'LOF') {
    const exRaw = ref.exchange?.toUpperCase()
    const exchange = (exRaw && exRaw !== 'PF' && exRaw !== 'OF')
      ? exRaw as CnExchange
      : inferCnExchangeFromSymbol(symbol)
    return { market: 'CN', assetClass: 'LOF', symbol, exchange }
  }
  if (ac === 'ETF') {
    const exRaw = ref.exchange?.toUpperCase()
    const exchange = (exRaw && exRaw !== 'PF' && exRaw !== 'OF')
      ? exRaw as CnExchange
      : inferCnExchangeFromSymbol(symbol)
    return { market: 'CN', assetClass: 'ETF', symbol, exchange }
  }
  if (ac === 'INDEX') {
    const exRaw = ref.exchange?.toUpperCase()
    const exchange = (exRaw === 'TI' || exRaw === 'SH' || exRaw === 'SZ' || exRaw === 'BJ')
      ? exRaw as CnExchange
      : symbol.startsWith('399')
        ? 'SZ'
        : symbol.startsWith('88')
          ? 'TI'
          : (symbol.startsWith('000') && symbol.length === 6) || isKnownShCnIndexCode(symbol)
            ? 'SH'
            : inferCnExchangeFromSymbol(symbol)
    return { market: 'CN', assetClass: 'INDEX', symbol, exchange }
  }
  // 无显式 class 时禁止把 16xxxx LOF 误判为 ETF
  if (isCnEtfSymbol(symbol)) {
    const exRaw = ref.exchange?.toUpperCase()
    const exchange = (exRaw && exRaw !== 'PF' && exRaw !== 'OF')
      ? exRaw as CnExchange
      : inferCnExchangeFromSymbol(symbol)
    return { market: 'CN', assetClass: 'ETF', symbol, exchange }
  }
  if (isCnLofSymbol(symbol)) {
    const exRaw = ref.exchange?.toUpperCase()
    const exchange = (exRaw && exRaw !== 'PF' && exRaw !== 'OF')
      ? exRaw as CnExchange
      : inferCnExchangeFromSymbol(symbol)
    return { market: 'CN', assetClass: 'LOF', symbol, exchange }
  }
  const exRaw = (ref.exchange ?? inferCnExchangeFromSymbol(symbol)).toUpperCase()
  const exchange = exRaw as CnExchange
  const assetClass = inferCnAssetClassFromSymbol(symbol, exchange)
  return { market: 'CN', assetClass, symbol, exchange }
}

/**
 * 推断 A 股 assetClass — 以 exchange 为主键：
 * - SZ：399xxx 为指数，其余为个股/ETF
 * - SH：000xxx 为指数，其余为个股/ETF
 * - 无 exchange：先推断交易所再分类
 */
export function inferCnAssetClassFromSymbol(symbol: string, exchange?: string | null): AssetClass {
  const c = canonicalCnSymbol(symbol)
  if (isCnEtfSymbol(c)) return 'ETF'
  if (isCnLofSymbol(c)) return 'LOF'
  const ex = (exchange ?? inferCnExchangeFromSymbol(c)).toUpperCase() as CnExchange
  if (ex === 'TI' || c.startsWith('88')) return 'INDEX'
  if (ex === 'SZ') return c.startsWith('399') ? 'INDEX' : 'EQUITY'
  if (ex === 'SH') return (c.startsWith('000') && c.length === 6) ? 'INDEX' : 'EQUITY'
  return 'EQUITY'
}

/**
 * 应用内统一 canonical symbol — 各市场唯一格式，上层只读写此格式。
 * Provider 层再用 instrumentProviderSymbol / 各 driver 自行转换。
 */
export function canonicalSymbolForMarket(market: Market, symbol: string): string {
  switch (market) {
    case 'CN':
      return canonicalCnSymbol(symbol)
    case 'US':
      return canonicalUsSymbol(symbol)
    case 'HK':
      return canonicalHkSymbol(symbol)
    case 'JP':
      return canonicalJpSymbol(symbol)
    case 'KR':
      return canonicalKrSymbol(symbol)
    case 'CRYPTO':
      return canonicalCryptoParts(symbol).symbol
    default:
      return symbol.trim().toUpperCase()
  }
}

/** 将 InstrumentRef 规范化为应用内统一格式（symbol / assetClass / quote） */
export function normalizeInstrumentRef(ref: InstrumentRef): InstrumentRef {
  const market = ref.market
  if (market === 'CRYPTO') {
    const { symbol, quote } = canonicalCryptoParts(ref.symbol, ref.quote)
    return {
      market: 'CRYPTO',
      assetClass: ref.assetClass === 'CRYPTO_PERP' ? 'CRYPTO_PERP' : 'CRYPTO_SPOT',
      symbol,
      quote,
      exchange: ref.exchange ?? 'binance',
    }
  }

  const symbol = canonicalSymbolForMarket(market, ref.symbol)
  if (market === 'CN') {
    const resolved = resolveCnInstrumentIdentity({ ...ref, symbol })
    return { ...resolved, quote: ref.quote }
  }

  let assetClass = ref.assetClass
  if (!['ETF', 'LOF', 'REIT', 'INDEX', 'FUND'].includes(assetClass)) {
    assetClass = 'EQUITY'
  }

  return {
    market,
    assetClass,
    symbol,
    exchange: ref.exchange,
    quote: ref.quote,
  }
}

/**
 * Stock-index 统一命名空间 — 全局标的唯一标识。
 * 格式：CN:SZ.000009、US:AAPL、HK:00700、CRYPTO:BINANCE.BTC/USDT
 * 不含 assetClass / 指数等业务分类，仅 MARKET[:EXCHANGE].SYMBOL。
 */
export function buildInstrumentNamespace(ref: InstrumentRef): string {
  const n = normalizeInstrumentRef(ref)
  switch (n.market) {
    case 'CN': {
      const exUp = n.exchange?.toUpperCase()
      if (n.assetClass === 'FUND' || exUp === 'PF' || exUp === 'OF') {
        return `CN:PF.${n.symbol}`
      }
      const ex = (n.exchange ?? inferCnExchangeFromSymbol(n.symbol)).toUpperCase()
      return `CN:${ex}.${n.symbol}`
    }
    case 'HK':
      return `HK:${n.symbol}`
    case 'US': {
      const ex = n.exchange?.toUpperCase()
      if (ex && (ex === 'NYSE' || ex === 'NASDAQ' || ex === 'AMEX')) {
        return `US:${ex}.${n.symbol}`
      }
      return `US:${n.symbol}`
    }
    case 'CRYPTO': {
      const quote = n.quote ?? 'USDT'
      const ex = (n.exchange ?? 'BINANCE').toUpperCase()
      return `CRYPTO:${ex}.${n.symbol}/${quote}`
    }
    case 'JP':
    case 'KR': {
      const ex = n.exchange ?? n.market
      return `${n.market}:${ex}.${n.symbol}`
    }
    default:
      return `${n.market}:${n.symbol}`
  }
}


export interface OpptrixInstrumentIdParts {
  market: Market
  assetClass: AssetClass
  symbol: string
  exchange?: string
}

const OPPTRIX_CN_SUFFIX_EXCHANGE: Record<string, CnExchange> = {
  SH: 'SH',
  SZ: 'SZ',
  BJ: 'BJ',
  TI: 'TI',
  OF: 'PF',
}

/** 拆分 Opptrix symbol 段后缀，如 688981.SH → body + SH */
export function splitOpptrixSymbolSegment(raw: string): { body: string; suffix?: string } {
  const s = String(raw ?? '').trim()
  const m = /^(.+?)\.(SH|SZ|BJ|TI|OF|HK|US)$/i.exec(s)
  if (m) return { body: m[1]!, suffix: m[2]!.toUpperCase() }
  return { body: s }
}

function opptrixClassToAssetClass(cls: string, market: Market): AssetClass | null {
  const c = cls.toLowerCase()
  switch (c) {
    case 'stock':
    case 'equity':
      return 'EQUITY'
    case 'ind':
    case 'index':
      return 'INDEX'
    case 'otc':
    case 'of':
    case 'fund':
      return 'FUND'
    case 'etf':
      return 'ETF'
    case 'lof':
      return 'LOF'
    case 'reit':
      return 'REIT'
    default:
      return market === 'CN' ? null : 'EQUITY'
  }
}

function parseCnOpptrixParts(cls: string, symbolSeg: string): OpptrixInstrumentIdParts | null {
  const assetClass = opptrixClassToAssetClass(cls, 'CN')
  if (!assetClass) return null
  const { body, suffix } = splitOpptrixSymbolSegment(symbolSeg)
  const symbol = canonicalCnSymbol(body)

  if (assetClass === 'FUND') {
    return { market: 'CN', assetClass: 'FUND', symbol, exchange: 'PF' }
  }
  if (assetClass === 'REIT') {
    const exchange = (suffix && OPPTRIX_CN_SUFFIX_EXCHANGE[suffix])
      ? OPPTRIX_CN_SUFFIX_EXCHANGE[suffix]
      : inferCnExchangeFromSymbol(symbol)
    return { market: 'CN', assetClass: 'REIT', symbol, exchange }
  }
  if (assetClass === 'LOF' || assetClass === 'ETF') {
    const exchange = (suffix && OPPTRIX_CN_SUFFIX_EXCHANGE[suffix])
      ? OPPTRIX_CN_SUFFIX_EXCHANGE[suffix]
      : inferCnExchangeFromSymbol(symbol)
    return { market: 'CN', assetClass, symbol, exchange }
  }
  if (assetClass === 'INDEX') {
    const exchange = suffix === 'TI'
      ? 'TI'
      : (suffix && OPPTRIX_CN_SUFFIX_EXCHANGE[suffix])
        ? OPPTRIX_CN_SUFFIX_EXCHANGE[suffix]
        : symbol.startsWith('399')
          ? 'SZ'
          : symbol.startsWith('88')
            ? 'TI'
            : inferCnExchangeFromSymbol(symbol)
    return { market: 'CN', assetClass: 'INDEX', symbol, exchange }
  }
  // STOCK / EQUITY
  const exchange = (suffix && OPPTRIX_CN_SUFFIX_EXCHANGE[suffix])
    ? OPPTRIX_CN_SUFFIX_EXCHANGE[suffix]
    : inferCnExchangeFromSymbol(symbol)
  return { market: 'CN', assetClass: 'EQUITY', symbol, exchange }
}

/**
 * 解析 OpptrixQuant instrument_id（`{MARKET}:{CLASS_TOKEN}:{SYMBOL}`，大小写不敏感）。
 * - CN:STOCK:688981.SH、CN:IND:881121.TI、CN:OTC:000037.OF、CN:ETF:510050.SH、CN:LOF:160105.SZ、CN:REIT:508000.SH
 * - 兼容旧 token：of/fund/etf/lof/reit/stock/index（小写）
 * - REIT 保留 .SH/.SZ 后缀；扶摇 fund_type=reits（见 resolveFuyaoFundRoute）
 */
export function parseOpptrixInstrumentId(id: string): OpptrixInstrumentIdParts | null {
  const parts = String(id ?? '').trim().split(':')
  if (parts.length !== 3) return null
  const market = String(parts[0] ?? '').toUpperCase() as Market
  const cls = String(parts[1] ?? '').trim()
  const symbolSeg = String(parts[2] ?? '').trim()
  if (!symbolSeg) return null

  if (market === 'CN') {
    return parseCnOpptrixParts(cls, symbolSeg)
  }

  const assetClass = opptrixClassToAssetClass(cls, market) ?? 'EQUITY'
  const { body, suffix } = splitOpptrixSymbolSegment(symbolSeg)

  if (market === 'US') {
    return {
      market: 'US',
      assetClass: assetClass === 'ETF' ? 'ETF' : 'EQUITY',
      symbol: canonicalUsSymbol(body),
    }
  }
  if (market === 'HK') {
    return {
      market: 'HK',
      assetClass: assetClass === 'ETF' ? 'ETF' : 'EQUITY',
      symbol: canonicalHkSymbol(body),
      exchange: 'HK',
    }
  }
  if (market === 'JP' || market === 'KR') {
    return { market, assetClass: 'EQUITY', symbol: body }
  }

  void suffix
  return null
}

function assetClassToOpptrixClassToken(assetClass: AssetClass): string {
  switch (assetClass) {
    case 'INDEX':
      return 'IND'
    case 'FUND':
      return 'OTC'
    case 'ETF':
      return 'ETF'
    case 'LOF':
      return 'LOF'
    case 'REIT':
      return 'REIT'
    case 'EQUITY':
    default:
      return 'STOCK'
  }
}

function buildOpptrixSymbolSegment(ref: InstrumentRef): string {
  const n = normalizeInstrumentRef(ref)
  if (n.market === 'CN') {
    if (n.assetClass === 'FUND') {
      return `${n.symbol}.OF`
    }
    const ex = (n.exchange ?? inferCnExchangeFromSymbol(n.symbol)).toUpperCase()
    return `${n.symbol}.${ex}`
  }
  if (n.market === 'US') {
    return `${n.symbol}.US`
  }
  if (n.market === 'HK') {
    return `${canonicalHkSymbol(n.symbol)}.HK`
  }
  return n.symbol
}

/**
 * OpptrixQuant 统一标的 ID — 搜索 / @ 引用 / UI 展示。
 * CN/US/HK 走 `{MARKET}:{CLASS_TOKEN}:{SYMBOL}`；其余市场回退命名空间。
 */
export function buildOpptrixInstrumentId(ref: InstrumentRef): string {
  const n = normalizeInstrumentRef(ref)
  if (n.market !== 'CN' && n.market !== 'US' && n.market !== 'HK') {
    return buildInstrumentNamespace(n)
  }
  const token = assetClassToOpptrixClassToken(n.assetClass)
  return `${n.market}:${token}:${buildOpptrixSymbolSegment(n)}`
}

/** 搜索展示 code：优先保留上游 OpptrixQuant instrument_id 原样，否则由 InstrumentRef 构建 */
export function resolveInstrumentSearchDisplayCode(
  ref: InstrumentRef,
  instrumentId?: string | null,
): string {
  const id = String(instrumentId ?? '').trim()
  if (id && parseOpptrixInstrumentId(id)) {
    return id
  }
  return buildOpptrixInstrumentId(ref)
}

/** 解析 Stock-index 命名空间字符串 → InstrumentRef */
export function parseInstrumentNamespace(raw: string): InstrumentRef | null {
  const text = raw.trim()
  if (!text) return null

  const cn = /^CN:(SH|SZ|BJ)[.:](\d{6})$/i.exec(text)
  if (cn) {
    return normalizeInstrumentRef({
      market: 'CN',
      symbol: cn[2]!,
      exchange: cn[1]!.toUpperCase(),
      assetClass: 'EQUITY',
    })
  }

  const cnPf = /^CN:PF[.:](\d{6})$/i.exec(text)
  if (cnPf) {
    return normalizeInstrumentRef({
      market: 'CN',
      symbol: cnPf[1]!,
      exchange: 'PF',
      assetClass: 'FUND',
    })
  }

  const cnOf = /^CN:OF[.:](\d{6})$/i.exec(text)
  if (cnOf) {
    return normalizeInstrumentRef({
      market: 'CN',
      symbol: cnOf[1]!,
      exchange: 'PF',
      assetClass: 'FUND',
    })
  }

  const us = /^US:(?:(NYSE|NASDAQ|AMEX)\.)?([A-Z0-9.-]+)$/i.exec(text)
  if (us) {
    return normalizeInstrumentRef({
      market: 'US',
      assetClass: 'EQUITY',
      symbol: us[2]!.toUpperCase(),
      exchange: us[1]?.toUpperCase(),
    })
  }

  const hk = /^HK:(?:HK\.)?(\d{1,5})$/i.exec(text)
  if (hk) {
    return normalizeInstrumentRef({
      market: 'HK',
      assetClass: 'EQUITY',
      symbol: hk[1]!,
      exchange: 'HK',
    })
  }

  const crypto = /^CRYPTO:(?:(BINANCE|OKX)\.)?([A-Z0-9]+)\/([A-Z0-9]+)$/i.exec(text)
  if (crypto) {
    return normalizeInstrumentRef({
      market: 'CRYPTO',
      assetClass: 'CRYPTO_SPOT',
      symbol: crypto[2]!.toUpperCase(),
      quote: crypto[3]!.toUpperCase(),
      exchange: crypto[1]?.toLowerCase() ?? 'binance',
    })
  }

  const regional = /^(JP|KR):([A-Z0-9]+)\.(.+)$/i.exec(text)
  if (regional) {
    const market = regional[1]!.toUpperCase() as Market
    return normalizeInstrumentRef({
      market,
      assetClass: 'EQUITY',
      symbol: regional[3]!,
      exchange: regional[2]!.toUpperCase(),
    })
  }

  return null
}

/** 从带前缀字符串解析并规范化，如 CN:SZ.000009 / HK:700 / US:AAPL / 600519 */
export function parseCanonicalInstrumentInput(raw: string): InstrumentRef | null {
  const text = raw.trim()
  if (!text) return null

  // OpptrixQuant 统一标的格式优先：CN:of:009049 / US:stock:AAPL / HK:stock:00700
  const fromOpptrix = parseOpptrixInstrumentId(text)
  if (fromOpptrix) {
    return normalizeInstrumentRef(fromOpptrix)
  }

  const fromNamespace = parseInstrumentNamespace(text)
  if (fromNamespace) return fromNamespace

  // A 股交易所前缀 / 后缀 — 显式消歧（SZ:000977 / 000977.SZ）
  const cnExPrefix = /^(SH|SZ|BJ):(\d{6})$/i.exec(text)
  if (cnExPrefix) {
    return normalizeInstrumentRef({
      market: 'CN',
      symbol: cnExPrefix[2]!,
      exchange: cnExPrefix[1]!.toUpperCase(),
      assetClass: 'EQUITY',
    })
  }
  const cnDotSuffix = /^(\d{6})\.(SH|SZ|BJ)$/i.exec(text)
  if (cnDotSuffix) {
    return normalizeInstrumentRef({
      market: 'CN',
      symbol: cnDotSuffix[1]!,
      exchange: cnDotSuffix[2]!.toUpperCase(),
      assetClass: 'EQUITY',
    })
  }

  // Tickflow / 行情后缀 — 显式消歧（00700.HK / AAPL.US）
  const hkDotSuffix = /^(\d{1,5})\.HK$/i.exec(text)
  if (hkDotSuffix) {
    return normalizeInstrumentRef({
      market: 'HK',
      assetClass: 'EQUITY',
      symbol: hkDotSuffix[1]!,
      exchange: 'HK',
    })
  }
  const usDotSuffix = /^([A-Z][A-Z0-9.-]{0,11})\.US$/i.exec(text)
  if (usDotSuffix) {
    return normalizeInstrumentRef({
      market: 'US',
      assetClass: 'EQUITY',
      symbol: usDotSuffix[1]!,
    })
  }

  const prefixed = stripMarketPrefix(text)
  if (prefixed.market) {
    const market = prefixed.market
    if (market === 'CRYPTO') {
      const { symbol, quote } = canonicalCryptoParts(prefixed.body)
      return normalizeInstrumentRef({
        market: 'CRYPTO',
        assetClass: 'CRYPTO_SPOT',
        symbol,
        quote,
        exchange: 'binance',
      })
    }
    if (market === 'CN') {
      const exBody = /^(SH|SZ|BJ):(\d{6})$/i.exec(prefixed.body)
      if (exBody) {
        return normalizeInstrumentRef({
          market: 'CN',
          symbol: exBody[2]!,
          exchange: exBody[1]!.toUpperCase(),
          assetClass: 'EQUITY',
        })
      }
      const symbol = canonicalCnSymbol(prefixed.body)
      return normalizeInstrumentRef({
        market: 'CN',
        assetClass: inferCnAssetClassFromSymbol(symbol),
        symbol,
      })
    }
    return normalizeInstrumentRef({
      market,
      assetClass: 'EQUITY',
      symbol: prefixed.body,
    })
  }

  // 6 位纯数字 → A 股（无歧义）。1-5 位裸数字跨市场歧义（港股 00700、日韩、A 股短写）→
  // 返回 null，须经 instrument_search 消歧；禁止 pad 成假 CN 权威身份。
  if (isUnambiguousCnDigits(text)) {
    const symbol = canonicalCnSymbol(text)
    return resolveCnInstrumentIdentity({ market: 'CN', assetClass: 'EQUITY', symbol })
  }
  if (isAmbiguousNumericCode(text)) {
    return null
  }

  if (/^[A-Z][A-Z0-9.-]{0,11}$/i.test(text) && !/^\d+$/.test(text)) {
    return normalizeInstrumentRef({ market: 'US', assetClass: 'EQUITY', symbol: text })
  }

  if (text.includes('/') || text.includes('-')) {
    const { symbol, quote } = canonicalCryptoParts(text)
    if (symbol && quote) {
      return normalizeInstrumentRef({
        market: 'CRYPTO',
        assetClass: 'CRYPTO_SPOT',
        symbol,
        quote,
        exchange: 'binance',
      })
    }
  }

  return null
}

/**
 * 严格解析别名 — 与 `parseCanonicalInstrumentInput` 同语义。
 * 歧义 1–5 位裸数字返回 `null`，调用方须走 instrument_search 消歧。
 */
export const tryParseInstrumentInput = parseCanonicalInstrumentInput

/** @ 引用 / 搜索展示标签 — OpptrixQuant 统一 ID */
export function instrumentRefLabel(ref: InstrumentRef): string {
  return buildOpptrixInstrumentId(ref)
}

/**
 * Engine / Provider 调用入参 — 从 canonical InstrumentRef 转为 driver 方法 args。
 * 默认与 canonical 相同；各 Provider driver 内可再做二次转换（如腾讯 qt 代码）。
 */
export function instrumentProviderSymbol(ref: InstrumentRef): string {
  const n = normalizeInstrumentRef(ref)
  if (n.market === 'CRYPTO') {
    return `${n.symbol}/${n.quote ?? 'USDT'}`
  }
  return n.symbol
}
