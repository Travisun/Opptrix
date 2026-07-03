import { httpGet } from './http.js'

const YAHOO_SEARCH = 'https://query2.finance.yahoo.com/v1/finance/search'

export interface YahooSearchQuote {
  symbol: string
  shortname?: string
  longname?: string
  exchange?: string
  quoteType?: string
}

export function parseYahooSearchQuotes(json: Record<string, unknown>): YahooSearchQuote[] {
  const quotes = (json.quotes as unknown[]) ?? []
  const out: YahooSearchQuote[] = []
  for (const row of quotes) {
    if (!row || typeof row !== 'object') continue
    const q = row as Record<string, unknown>
    const symbol = String(q.symbol ?? '').trim()
    if (!symbol) continue
    out.push({
      symbol,
      shortname: q.shortname != null ? String(q.shortname) : undefined,
      longname: q.longname != null ? String(q.longname) : undefined,
      exchange: q.exchange != null ? String(q.exchange) : undefined,
      quoteType: q.quoteType != null ? String(q.quoteType) : undefined,
    })
  }
  return out
}

export async function fetchYahooFinanceSearch(q: string, count = 25): Promise<YahooSearchQuote[]> {
  const raw = await httpGet(
    YAHOO_SEARCH,
    {
      q,
      quotesCount: String(count),
      newsCount: '0',
      enableFuzzyQuery: 'false',
    },
    15000,
    {
      Referer: 'https://finance.yahoo.com/',
      Accept: 'application/json',
    },
  )
  return parseYahooSearchQuotes(raw as Record<string, unknown>)
}
