import type { Market } from '@opptrix/shared'
import {
  canonicalHkSymbol,
  canonicalJpSymbol,
  canonicalKrSymbol,
} from '@opptrix/shared'
import { normalizeUsSymbol } from './us-market.js'

export type RegionalEquityMarket = 'JP' | 'KR' | 'HK'

export function isRegionalEquityMarket(market: Market): market is RegionalEquityMarket {
  return market === 'JP' || market === 'KR' || market === 'HK'
}

/** 本地 canonical symbol → Yahoo Finance ticker（Provider 专用） */
export function toYahooFinanceSymbol(market: Market, symbol: string): string {
  const raw = symbol.trim().toUpperCase().replace(/^(JP|KR|HK):/i, '')
  if (market === 'US') return normalizeUsSymbol(raw)
  if (market === 'JP') {
    const digits = canonicalJpSymbol(raw)
    return `${digits || raw}.T`
  }
  if (market === 'KR') {
    const digits = canonicalKrSymbol(raw)
    return `${digits}.KS`
  }
  if (market === 'HK') {
    const hk = canonicalHkSymbol(raw)
    const yahoo = hk.length > 4 ? hk.slice(-4) : hk
    return `${yahoo}.HK`
  }
  return raw
}

/** @deprecated 使用 @opptrix/shared canonicalHkSymbol / canonicalJpSymbol / canonicalKrSymbol */
export function normalizeRegionalSymbol(market: RegionalEquityMarket, symbol: string): string {
  if (market === 'JP') return canonicalJpSymbol(symbol)
  if (market === 'KR') return canonicalKrSymbol(symbol)
  return canonicalHkSymbol(symbol)
}
