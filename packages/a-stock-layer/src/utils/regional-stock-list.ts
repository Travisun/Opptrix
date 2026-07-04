import type { StockListItem } from '@opptrix/shared'
import { getRegionalEquitySeeds } from '../data/regional-equity-seeds.js'
import type { RegionalEquityMarket } from './regional-symbol.js'
import { normalizeRegionalSymbol } from './regional-symbol.js'
import type { YahooSearchQuote } from './yahoo-search.js'

const SUFFIX: Record<RegionalEquityMarket, string> = {
  JP: '.T',
  KR: '.KS',
  HK: '.HK',
}

export function regionalSeedStockList(market: RegionalEquityMarket): StockListItem[] {
  return getRegionalEquitySeeds(market).map(seed => ({
    code: normalizeRegionalSymbol(market, seed.code),
    name: seed.name,
    market,
    industry: seed.industry ?? '',
  }))
}

export function yahooQuoteToRegionalStockRow(
  market: RegionalEquityMarket,
  quote: YahooSearchQuote,
): StockListItem | null {
  const suffix = SUFFIX[market]
  const sym = quote.symbol.trim().toUpperCase()
  if (!sym.endsWith(suffix)) return null
  if (quote.quoteType && quote.quoteType !== 'EQUITY') return null
  const rawCode = sym.slice(0, -suffix.length)
  const code = normalizeRegionalSymbol(market, rawCode)
  if (!code) return null
  return {
    code,
    name: quote.longname || quote.shortname || code,
    market,
    industry: '',
  }
}
