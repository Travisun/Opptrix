import type { Market } from '@opptrix/shared'
import { normalizeUsSymbol } from './us-market.js'

export type RegionalEquityMarket = 'JP' | 'KR' | 'HK'

export function isRegionalEquityMarket(market: Market): market is RegionalEquityMarket {
  return market === 'JP' || market === 'KR' || market === 'HK'
}

/** 本地 symbol → Yahoo Finance ticker */
export function toYahooFinanceSymbol(market: Market, symbol: string): string {
  const raw = symbol.trim().toUpperCase().replace(/^(JP|KR|HK):/i, '')
  if (market === 'US') return normalizeUsSymbol(raw)
  if (market === 'JP') {
    const digits = raw.replace(/\D/g, '')
    return `${digits || raw}.T`
  }
  if (market === 'KR') {
    const digits = raw.replace(/\D/g, '').padStart(6, '0')
    return `${digits}.KS`
  }
  if (market === 'HK') {
    const digits = raw.replace(/\D/g, '')
    const hk = digits.length > 4 ? digits.slice(-4) : digits.padStart(4, '0')
    return `${hk}.HK`
  }
  return raw
}

export function normalizeRegionalSymbol(market: RegionalEquityMarket, symbol: string): string {
  const raw = symbol.trim().toUpperCase().replace(/^(JP|KR|HK):/i, '')
  if (market === 'JP') return raw.replace(/\D/g, '') || raw
  if (market === 'KR') return raw.replace(/\D/g, '').padStart(6, '0')
  const digits = raw.replace(/\D/g, '')
  return digits.length > 4 ? digits : digits.padStart(5, '0')
}
