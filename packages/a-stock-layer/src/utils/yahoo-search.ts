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
