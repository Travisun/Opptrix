import { getUserDataStore } from '@opptrix/user-store'
import type { InstrumentRef, ResearchResult, UnifiedInstrumentQuote } from '@opptrix/shared'
import { instrumentRefKey, UI_CACHE_TTL_MS } from '@opptrix/shared'

/** 与 @opptrix/shared UI_CACHE_TTL_MS.watchlistQuotes 一致 */
export const RIGHT_PANEL_QUOTE_TTL_MS = UI_CACHE_TTL_MS.watchlistQuotes

/** 与 @opptrix/shared UI_CACHE_TTL_MS.portfolioSummary 一致 */
export const RIGHT_PANEL_PORTFOLIO_TTL_MS = UI_CACHE_TTL_MS.portfolioSummary

const PORTFOLIO_NS = 'portfolio_summary_cache'
const QUOTE_NS = 'instrument_quote_cache'
const PORTFOLIO_DOC_ID = 'latest'

export type RightPanelCacheEnvelope<T> = {
  cached_at: string
  cached_at_ms: number
  message: string
  data: T
}

export function readPortfolioSummaryCache(): RightPanelCacheEnvelope<Record<string, unknown>> | null {
  try {
    const doc = getUserDataStore().getDocument<RightPanelCacheEnvelope<Record<string, unknown>>>(
      PORTFOLIO_NS,
      PORTFOLIO_DOC_ID,
    )
    if (!doc?.data || typeof doc.cached_at_ms !== 'number') return null
    return doc
  } catch {
    return null
  }
}

export function writePortfolioSummaryCache(result: ResearchResult): void {
  if (!result.success || result.data == null) return
  const entry: RightPanelCacheEnvelope<Record<string, unknown>> = {
    cached_at: new Date().toISOString(),
    cached_at_ms: Date.now(),
    message: result.message ?? '',
    data: result.data as Record<string, unknown>,
  }
  getUserDataStore().setDocument(PORTFOLIO_NS, PORTFOLIO_DOC_ID, entry)
}

export function readInstrumentQuoteCache(ref: InstrumentRef): UnifiedInstrumentQuote | null {
  try {
    const doc = getUserDataStore().getDocument<RightPanelCacheEnvelope<UnifiedInstrumentQuote>>(
      QUOTE_NS,
      instrumentRefKey(ref),
    )
    if (!doc?.data?.instrument) return null
    const price = doc.data.price
    if (price == null || !Number.isFinite(price) || price <= 0) return null
    return doc.data
  } catch {
    return null
  }
}

export function writeInstrumentQuoteCache(quote: UnifiedInstrumentQuote): void {
  if (!quote.instrument) return
  const price = quote.price
  if (price == null || !Number.isFinite(price) || price <= 0) return
  const entry: RightPanelCacheEnvelope<UnifiedInstrumentQuote> = {
    cached_at: new Date().toISOString(),
    cached_at_ms: Date.now(),
    message: '',
    data: quote,
  }
  getUserDataStore().setDocument(QUOTE_NS, instrumentRefKey(quote.instrument), entry)
}

export function readInstrumentQuotesCache(refs: InstrumentRef[]): {
  quotes: UnifiedInstrumentQuote[]
  newestMs: number
} {
  const quotes: UnifiedInstrumentQuote[] = []
  let newestMs = 0
  for (const ref of refs) {
    try {
      const doc = getUserDataStore().getDocument<RightPanelCacheEnvelope<UnifiedInstrumentQuote>>(
        QUOTE_NS,
        instrumentRefKey(ref),
      )
      if (!doc?.data?.instrument) continue
      const price = doc.data.price
      if (price == null || !Number.isFinite(price) || price <= 0) continue
      quotes.push(doc.data)
      if (doc.cached_at_ms > newestMs) newestMs = doc.cached_at_ms
    } catch {
      /* skip */
    }
  }
  return { quotes, newestMs }
}

export function writeInstrumentQuotesFromResult(result: ResearchResult): void {
  if (!result.success || result.data == null || typeof result.data !== 'object') return
  const payload = result.data as { quotes?: UnifiedInstrumentQuote[] }
  for (const quote of payload.quotes ?? []) {
    writeInstrumentQuoteCache(quote)
  }
}

export function resetRightPanelCacheForTests(): void {
  const store = getUserDataStore()
  store.deleteDocument(PORTFOLIO_NS, PORTFOLIO_DOC_ID)
  for (const id of store.listDocumentIds(QUOTE_NS)) {
    store.deleteDocument(QUOTE_NS, id)
  }
}

export function instrumentQuotesInflightKey(refs: InstrumentRef[]): string {
  return refs.map(r => instrumentRefKey(r)).sort().join('|')
}
