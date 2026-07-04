import type { StockListItem } from '../../../core/schema.js'
import type { RegionalEquityMarket } from '../../../utils/regional-symbol.js'
import { normalizeUsSymbol } from '../../../utils/us-market.js'
import { parseYahooSearchQuotes } from '../../../utils/yahoo-search.js'
import { yahooQuoteToRegionalStockRow } from '../../../utils/regional-stock-list.js'
import { usListScreenerIds } from '../api/symbols.js'

function str(v: unknown): string {
  return v == null ? '' : String(v)
}

export function mapUsSearchQuotes(json: Record<string, unknown>): StockListItem[] {
  const quotes = parseYahooSearchQuotes(json)
  const rows: StockListItem[] = []
  for (const q of quotes) {
    if (q.quoteType && q.quoteType !== 'EQUITY') continue
    const sym = q.symbol.trim().toUpperCase()
    if (!sym || sym.includes('.')) continue
    rows.push({
      code: normalizeUsSymbol(sym),
      name: q.longname || q.shortname || sym,
      market: 'US',
      industry: str(q.exchange),
    })
  }
  return rows
}

export function mapUsScreenerQuotes(json: Record<string, unknown>): StockListItem[] {
  const result = ((json.finance as Record<string, unknown>)?.result as unknown[])?.[0] as Record<string, unknown> | undefined
  const quotes = (result?.quotes as unknown[]) ?? []
  const rows: StockListItem[] = []
  for (const row of quotes) {
    if (!row || typeof row !== 'object') continue
    const q = row as Record<string, unknown>
    if (str(q.quoteType) && str(q.quoteType) !== 'EQUITY') continue
    const sym = str(q.symbol).trim().toUpperCase()
    if (!sym || sym.includes('.')) continue
    rows.push({
      code: normalizeUsSymbol(sym),
      name: str(q.shortName ?? q.longName ?? sym),
      market: 'US',
      industry: str(q.exchange),
    })
  }
  return rows
}

export function mapRegionalSearchQuotes(
  market: RegionalEquityMarket,
  json: Record<string, unknown>,
): StockListItem[] {
  const quotes = parseYahooSearchQuotes(json)
  const rows: StockListItem[] = []
  for (const q of quotes) {
    const row = yahooQuoteToRegionalStockRow(market, q)
    if (row) rows.push(row)
  }
  return rows
}

export function mergeStockListRows(rows: StockListItem[]): StockListItem[] {
  const byCode = new Map<string, StockListItem>()
  for (const row of rows) {
    if (!byCode.has(row.code)) byCode.set(row.code, row)
  }
  return [...byCode.values()]
}

export function defaultUsListQueries(): string[] {
  return ['AAPL', 'MSFT', 'NVDA', 'AMZN', 'GOOGL', 'META', 'TSLA', 'BRK-B']
}

export function defaultUsScreenerIds(): readonly string[] {
  return usListScreenerIds()
}
