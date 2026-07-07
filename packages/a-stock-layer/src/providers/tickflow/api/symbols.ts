import type { Market } from '@opptrix/shared'
import { inferMarketFromSymbol, isCnEtfCode } from '../../../core/instrument.js'
import { normalizeCode, resolveStockMarketCode } from '../../../utils/helpers.js'
import { normalizeUsSymbol } from '../../../utils/us-market.js'

export interface ParsedTickflowSymbol {
  code: string
  market: Market
  exchange?: string
}

export type TickflowRegion = 'CN' | 'US' | 'HK'

const TICKFLOW_SUFFIX: Record<string, Market> = {
  SH: 'CN',
  SZ: 'CN',
  BJ: 'CN',
  US: 'US',
  HK: 'HK',
}

const CN_EXCHANGE_SUFFIX: Record<string, string> = {
  SH: 'SH',
  SZ: 'SZ',
  BJ: 'BJ',
}

function cnExchangeSuffix(code: string): string {
  const c = normalizeCode(code)
  if (isCnEtfCode(c)) {
    const head2 = c.slice(0, 2)
    const head3 = c.slice(0, 3)
    if (head2 === '51' || head2 === '52' || head2 === '56' || head2 === '58') return 'SH'
    if (head3 === '159' || head2 === '16') return 'SZ'
  }
  return CN_EXCHANGE_SUFFIX[resolveStockMarketCode(c)] ?? 'SZ'
}

function toTickflowSymbolFromMarket(market: Market, code: string): string {
  const raw = code.trim()
  if (/\.(SH|SZ|BJ|US|HK)$/i.test(raw)) return raw.toUpperCase()

  if (market === 'US') return `${normalizeUsSymbol(raw)}.US`
  if (market === 'HK') {
    const hk = raw.replace(/^HK/i, '').replace(/\D/g, '').padStart(5, '0')
    return `${hk}.HK`
  }
  if (market === 'CN') {
    const c = normalizeCode(raw)
    const ex = cnExchangeSuffix(c)
    return `${c}.${ex}`
  }
  throw new Error(`TickFlow 暂不支持市场：${market}`)
}

/** Opptrix market + code, or bare code with inferred market → TickFlow symbol. */
export function toTickflowSymbol(market: Market, code: string): string
export function toTickflowSymbol(input: string): string
export function toTickflowSymbol(marketOrInput: Market | string, code?: string): string {
  if (code !== undefined) return toTickflowSymbolFromMarket(marketOrInput as Market, code)
  const input = marketOrInput.trim()
  if (/\.(SH|SZ|BJ|US|HK)$/i.test(input)) return input.toUpperCase()
  return toTickflowSymbolFromMarket(inferMarketFromSymbol(input), input)
}

/** TickFlow symbol → Opptrix code + market. */
export function parseTickflowSymbol(symbol: string): ParsedTickflowSymbol {
  const s = symbol.trim().toUpperCase()
  const dot = s.lastIndexOf('.')
  if (dot <= 0) {
    const market = inferMarketFromSymbol(s)
    return { code: market === 'US' ? normalizeUsSymbol(s) : normalizeCode(s), market }
  }
  const code = s.slice(0, dot)
  const suffix = s.slice(dot + 1)
  const market = TICKFLOW_SUFFIX[suffix]
  if (!market) throw new Error(`未知的 TickFlow 交易所后缀：${suffix}`)
  if (suffix === 'US') return { code: normalizeUsSymbol(code), market, exchange: suffix }
  if (suffix === 'HK') return { code: code.replace(/^0+/, '') || '0', market, exchange: suffix }
  return { code: normalizeCode(code), market, exchange: suffix }
}

/** TickFlow symbol → Opptrix bare code. */
export function fromTickflowSymbol(symbol: string): string {
  return parseTickflowSymbol(symbol).code
}

/** Infer Opptrix market from TickFlow symbol suffix. */
export function inferMarketFromTickflowSymbol(symbol: string): Market {
  const s = symbol.trim().toUpperCase()
  const dot = s.lastIndexOf('.')
  if (dot <= 0) throw new Error(`无效的 TickFlow 标的代码：${symbol}`)
  const suffix = s.slice(dot + 1)
  const market = TICKFLOW_SUFFIX[suffix]
  if (!market) throw new Error(`未知的 TickFlow 交易所后缀：${suffix}`)
  return market
}

/** TickFlow region code for API payloads (CN / US / HK). */
export function tickflowRegion(symbol: string): TickflowRegion | null {
  try {
    const market = inferMarketFromTickflowSymbol(symbol)
    if (market === 'CN' || market === 'US' || market === 'HK') return market
    return null
  } catch {
    return null
  }
}

/** Map TickFlow exchange / region to Opptrix list market. */
export function listMarketFromExchange(exchange: string, region?: string): Market {
  const r = String(region ?? exchange).trim().toUpperCase()
  if (r === 'US') return 'US'
  if (r === 'HK') return 'HK'
  return 'CN'
}
