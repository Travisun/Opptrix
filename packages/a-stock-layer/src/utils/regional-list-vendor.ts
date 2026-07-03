import type { RegionalEquityMarket } from './regional-symbol.js'
import { normalizeRegionalSymbol } from './regional-symbol.js'
import { fetchYahooFinanceSearch, type YahooSearchQuote } from './yahoo-search.js'

export interface RegionalListVendorItem {
  code: string
  name: string
  exchange?: string | null
  industry?: string
  source: 'yahoo_search'
}

const SUFFIX: Record<RegionalEquityMarket, string> = {
  JP: '.T',
  KR: '.KS',
  HK: '.HK',
}

/** Per-market search queries — supplements MVP seed lists via Yahoo Finance search API */
const SEARCH_QUERIES: Record<RegionalEquityMarket, string[]> = {
  JP: ['トヨタ', 'ソニー', '任天堂', 'キーエンス', '三菱UFJ'],
  KR: ['삼성전자', 'SK하이닉스', 'NAVER', '현대차', 'LG화학'],
  HK: ['腾讯', '阿里巴巴', '美团', '汇丰', '中国移动'],
}

export function yahooQuoteToRegionalItem(
  market: RegionalEquityMarket,
  quote: YahooSearchQuote,
): RegionalListVendorItem | null {
  const suffix = SUFFIX[market]
  const sym = quote.symbol.trim().toUpperCase()
  if (!sym.endsWith(suffix)) return null
  if (quote.quoteType && quote.quoteType !== 'EQUITY') return null
  const rawCode = sym.slice(0, -suffix.length)
  const code = normalizeRegionalSymbol(market, rawCode)
  if (!code) return null
  const name = quote.longname || quote.shortname || code
  return {
    code,
    name,
    exchange: quote.exchange ?? null,
    industry: 'Yahoo search',
    source: 'yahoo_search',
  }
}

/** Online discovery — merges unique codes across configured search queries */
export async function discoverRegionalListFromYahoo(
  market: RegionalEquityMarket,
  opts?: { queries?: string[]; perQuery?: number },
): Promise<RegionalListVendorItem[]> {
  const queries = opts?.queries ?? SEARCH_QUERIES[market]
  const perQuery = opts?.perQuery ?? 12
  const byCode = new Map<string, RegionalListVendorItem>()

  for (const q of queries) {
    try {
      const quotes = await fetchYahooFinanceSearch(q, perQuery)
      for (const quote of quotes) {
        const item = yahooQuoteToRegionalItem(market, quote)
        if (item && !byCode.has(item.code)) byCode.set(item.code, item)
      }
    } catch {
      /* skip failed query */
    }
  }

  return [...byCode.values()]
}
