import type { AssetClass, InstrumentRef, Market } from '@opptrix/shared'
import { isShIndexCode, normalizeCode, resolveStockMarketCode, type StockMarket } from '../utils/helpers.js'
import { isValidUsSymbol, normalizeUsSymbol } from '../utils/us-market.js'
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
    return input
  }
  const market = opts?.market ?? inferMarketFromSymbol(String(input))
  let symbol: string
  let quote: string | undefined
  let exchange: string | undefined
  if (market === 'CRYPTO') {
    const pair = parseCryptoPair(String(input))
    symbol = pair?.base ?? normalizeCryptoBase(String(input))
    quote = pair?.quote
    exchange = 'binance'
  } else if (market === 'US') {
    symbol = normalizeUsSymbol(String(input))
  } else {
    symbol = normalizeCode(String(input))
    exchange = cnMarketFromCode(symbol)
  }
  const assetClass = opts?.assetClass ?? (
    market === 'CN' ? inferCnAssetClass(symbol)
      : market === 'CRYPTO' ? 'CRYPTO_SPOT' as const
        : 'EQUITY' as const
  )
  if (market === 'CN' && !exchange) exchange = cnMarketFromCode(symbol)
  return { market, assetClass, symbol, exchange, quote }
}

function normalizeCryptoBase(s: string): string {
  return s.trim().toUpperCase().replace(/[^A-Z0-9]/g, '')
}

/** Heuristic: crypto pair → US ticker → CN 6-digit */
export function inferMarketFromSymbol(raw: string): Market {
  if (/^(US|NYSE|NASDAQ|AMEX):/i.test(raw.trim())) return 'US'
  if (/^(CRYPTO|BINANCE|OKX):/i.test(raw.trim())) return 'CRYPTO'
  if (isCryptoPairNotation(raw)) return 'CRYPTO'
  const s = raw.trim()
  if (/^\d+$/.test(s) && s.length <= 6) return 'CN'
  if (isValidUsSymbol(s)) return 'US'
  return 'CN'
}

export function instrumentId(ref: InstrumentRef): string {
  const ex = ref.exchange ?? ''
  return `${ref.market}:${ref.assetClass}:${ref.symbol}${ex ? `:${ex}` : ''}`
}
