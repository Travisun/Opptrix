import type { AssetClass, InstrumentRef, Market } from '@opptrix/shared'
import {
  instrumentRefKey,
  normalizeInstrumentRef,
  parseCanonicalInstrumentInput,
} from '@opptrix/shared'
import { isShIndexCode, normalizeCode, resolveStockMarketCode, type StockMarket } from '../utils/helpers.js'
import { isValidUsSymbol } from '../utils/us-market.js'
import { isCryptoPairNotation, parseCryptoPair } from '../utils/crypto-market.js'

/** A 股 ETF 代码段（宽基/行业/跨境等） */
export function isCnEtfCode(code: string): boolean {
  const c = normalizeCode(code)
  if (c.length !== 6) return false
  const head2 = c.slice(0, 2)
  const head3 = c.slice(0, 3)
  if (head2 === '51' || head2 === '52' || head2 === '56' || head2 === '58') return true
  if (head3 === '159' || head2 === '16') return true
  return false
}

export function cnMarketFromCode(code: string): StockMarket {
  return resolveStockMarketCode(code)
}

export function inferCnAssetClass(code: string): AssetClass {
  const c = normalizeCode(code)
  if (isShIndexCode(c) || c.startsWith('399')) return 'INDEX'
  if (isCnEtfCode(c)) return 'ETF'
  return 'EQUITY'
}

export function toInstrumentRef(
  input: string | InstrumentRef,
  opts?: { market?: Market; assetClass?: AssetClass },
): InstrumentRef {
  if (typeof input === 'object' && input != null && 'symbol' in input) {
    return normalizeInstrumentRef(input)
  }
  const raw = String(input).trim()
  if (!raw) {
    return normalizeInstrumentRef({ market: 'CN', assetClass: 'EQUITY', symbol: '000000' })
  }

  if (opts?.market) {
    const market = opts.market
    if (market === 'CRYPTO') {
      const pair = parseCryptoPair(raw)
      return normalizeInstrumentRef({
        market: 'CRYPTO',
        assetClass: opts.assetClass ?? 'CRYPTO_SPOT',
        symbol: pair?.base ?? raw,
        quote: pair?.quote ?? 'USDT',
        exchange: 'binance',
      })
    }
    if (market === 'CN') {
      const symbol = normalizeCode(raw)
      return normalizeInstrumentRef({
        market: 'CN',
        assetClass: opts.assetClass ?? inferCnAssetClass(symbol),
        symbol,
        exchange: cnMarketFromCode(symbol),
      })
    }
    return normalizeInstrumentRef({
      market,
      assetClass: opts.assetClass ?? 'EQUITY',
      symbol: raw,
    })
  }

  const parsed = parseCanonicalInstrumentInput(raw)
  if (parsed) return parsed

  const market = inferMarketFromSymbol(raw)
  if (market === 'CRYPTO') {
    const pair = parseCryptoPair(raw)
    return normalizeInstrumentRef({
      market: 'CRYPTO',
      assetClass: 'CRYPTO_SPOT',
      symbol: pair?.base ?? raw,
      quote: pair?.quote ?? 'USDT',
      exchange: 'binance',
    })
  }
  if (market === 'CN') {
    const symbol = normalizeCode(raw)
    return normalizeInstrumentRef({
      market: 'CN',
      assetClass: inferCnAssetClass(symbol),
      symbol,
      exchange: cnMarketFromCode(symbol),
    })
  }
  return normalizeInstrumentRef({ market: 'US', assetClass: 'EQUITY', symbol: raw })
}

/** Heuristic: crypto pair → US ticker → CN 6-digit.
 *  1-5 位纯数字有跨市场歧义（港股 5 位码/日韩/省略前导 0 的 A 股短写），
 *  不在这里武断归 CN；返回 'CN' 仅作为兜底，上层应优先经 parseCanonicalInstrumentInput
 *  与 instrument_search 消歧后再构造 InstrumentRef。 */
export function inferMarketFromSymbol(raw: string): Market {
  if (/^(US|NYSE|NASDAQ|AMEX):/i.test(raw.trim())) return 'US'
  if (/^(CRYPTO|BINANCE|OKX):/i.test(raw.trim())) return 'CRYPTO'
  if (isCryptoPairNotation(raw)) return 'CRYPTO'
  const s = raw.trim()
  // 仅 6 位纯数字可无歧义判为 A 股；短数字码交由上层搜索消歧。
  if (/^\d{6}$/.test(s)) return 'CN'
  if (isValidUsSymbol(s)) return 'US'
  return 'CN'
}

export function instrumentId(ref: InstrumentRef): string {
  return instrumentRefKey(normalizeInstrumentRef(ref))
}
