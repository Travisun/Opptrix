import type { InstrumentRef, Market } from '@opptrix/shared'
import { instrumentRefKey, normalizeInstrumentRef } from '@opptrix/shared'
import { normalizeCode } from '../utils/helpers.js'
import { normalizeHkEquityCode } from '../utils/hk-market.js'
import { normalizeUsSymbol } from '../utils/us-market.js'
import { legacyToInstrument } from '../watchlist/instrument.js'

export function inferPortfolioMarket(code: string, market?: Market): Market {
  if (market) return market
  return legacyToInstrument(code).market
}

export function normalizePortfolioSymbol(code: string, market: Market): string {
  switch (market) {
    case 'HK':
      return normalizeHkEquityCode(code)
    case 'US':
      return normalizeUsSymbol(code)
    case 'CN':
      return normalizeCode(code)
    default:
      return code.trim()
  }
}

export function portfolioInstrumentRef(code: string, market?: Market): InstrumentRef {
  const m = inferPortfolioMarket(code, market)
  const symbol = normalizePortfolioSymbol(code, m)
  if (m === 'CN') return legacyToInstrument(symbol)
  return normalizeInstrumentRef({ market: m, assetClass: 'EQUITY', symbol })
}

export function portfolioLedgerKey(code: string, market?: Market): string {
  return instrumentRefKey(portfolioInstrumentRef(code, market))
}

/** 账本展示用代码 — CN 六位，港/美为 canonical symbol */
export function portfolioDisplayCode(code: string, market?: Market): string {
  const ref = portfolioInstrumentRef(code, market)
  if (ref.market === 'CN') return normalizeCode(ref.symbol)
  return ref.symbol
}

export function portfolioCodeAliases(code: string, market?: Market): Set<string> {
  const ref = portfolioInstrumentRef(code, market)
  const aliases = new Set<string>()
  aliases.add(ref.symbol)
  aliases.add(portfolioDisplayCode(code, market))
  aliases.add(portfolioLedgerKey(code, market))
  if (ref.market === 'CN') {
    aliases.add(normalizeCode(ref.symbol))
  }
  if (ref.market === 'HK') {
    aliases.add(`HK:${ref.symbol}`)
  }
  if (ref.market === 'US') {
    aliases.add(`US:${ref.symbol}`)
  }
  return aliases
}

export function portfolioCodesMatch(
  aCode: string,
  aMarket: Market | undefined,
  bCode: string,
  bMarket: Market | undefined,
): boolean {
  return portfolioLedgerKey(aCode, aMarket) === portfolioLedgerKey(bCode, bMarket)
}
