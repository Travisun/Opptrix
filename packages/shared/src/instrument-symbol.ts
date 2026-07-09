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
  const head2 = c.slice(0, 2)
  const head3 = c.slice(0, 3)
  if (head2 === '51' || head2 === '52' || head2 === '56' || head2 === '58') return true
  if (head3 === '159' || head2 === '16') return true
  return false
}

function isCnIndexSymbol(symbol: string): boolean {
  const c = canonicalCnSymbol(symbol)
  return c.startsWith('399')
    || (c.startsWith('000') && c.length === 6 && parseInt(c, 10) < 1000)
}

export function inferCnAssetClassFromSymbol(symbol: string): AssetClass {
  const c = canonicalCnSymbol(symbol)
  if (isCnIndexSymbol(c)) return 'INDEX'
  if (isCnEtfSymbol(c)) return 'ETF'
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
  let assetClass = ref.assetClass
  if (market === 'CN') {
    assetClass = ref.assetClass === 'ETF' || ref.assetClass === 'INDEX'
      ? ref.assetClass
      : inferCnAssetClassFromSymbol(symbol)
  } else if (assetClass !== 'ETF' && assetClass !== 'INDEX') {
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

/** 从带前缀字符串解析并规范化，如 HK:700 / US:AAPL / 600519 */
export function parseCanonicalInstrumentInput(raw: string): InstrumentRef | null {
  const text = raw.trim()
  if (!text) return null

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

  // 6 位纯数字 → A 股（A 股代码段固定 6 位，CN 内部可继续区分 SH/SZ/BJ/ETF/INDEX），
  // 本地解析无歧义。1-5 位数字属于跨市场歧义码（港股 5 位码如 00700、日韩代码、省略前导 0 的
  // A 股短写）：不直接当错，兜底按 A 股原样 symbol 构造（不 padStart 到 6 位），
  // 但调用方应优先经 instrument_search 跨市场搜索拿到带正确 market 的 ref。
  // 可用 isAmbiguousNumericCode(text) 判断并走搜索路径。
  if (isUnambiguousCnDigits(text)) {
    const symbol = canonicalCnSymbol(text)
    return normalizeInstrumentRef({
      market: 'CN',
      assetClass: inferCnAssetClassFromSymbol(symbol),
      symbol,
    })
  }
  if (isAmbiguousNumericCode(text)) {
    // 跨市场歧义的短数字码（1-5 位）：不经过 canonicalCnSymbol 规范化（避免 padStart 到 6 位
    // 把 "700" 错当 "000700"），返回一个 symbol 为原码的 CN EQUITY ref 作为兜底。
    // 调用方应优先用 isAmbiguousNumericCode(text) 判断并经 instrument_search 消歧。
    return {
      market: 'CN',
      assetClass: 'EQUITY',
      symbol: text.trim(),
    }
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

/** @ 引用 / 搜索展示标签 — CN 裸代码，跨市场 MARKET:symbol */
export function instrumentRefLabel(ref: InstrumentRef): string {
  const n = normalizeInstrumentRef(ref)
  if (n.market === 'CN') return n.symbol
  if (n.market === 'CRYPTO' && n.quote) return `CRYPTO:${n.symbol}/${n.quote}`
  return `${n.market}:${n.symbol}`
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
