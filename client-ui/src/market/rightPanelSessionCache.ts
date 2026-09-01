import type { MarketQuote } from '../types/market'
import type { PortfolioSummaryData } from '../types/schemas'
import {
  readSessionCacheEnvelope,
  writeSessionCacheEnvelope,
} from '../data/sessionCacheEnvelope'

const WATCHLIST_QUOTES_KEY = 'opptrix-watchlist-quotes'
const PORTFOLIO_SUMMARY_KEY = 'opptrix-portfolio-summary'

function isQuotesMap(data: unknown): data is Record<string, MarketQuote> {
  return !!data && typeof data === 'object' && !Array.isArray(data)
}

function isPortfolioSummary(data: unknown): data is PortfolioSummaryData {
  return !!data
    && typeof data === 'object'
    && Array.isArray((data as PortfolioSummaryData).holdings)
}

export type WatchlistQuotesSessionCache = {
  quotes: Record<string, MarketQuote>
  cached_at_ms: number
}

export function readWatchlistQuotesSessionCache(): WatchlistQuotesSessionCache | null {
  const hit = readSessionCacheEnvelope(WATCHLIST_QUOTES_KEY, isQuotesMap)
  if (!hit || !Object.keys(hit.data).length) return null
  return { quotes: hit.data, cached_at_ms: hit.cached_at_ms }
}

export function writeWatchlistQuotesSessionCache(
  quotes: Record<string, MarketQuote>,
  cachedAtMs = Date.now(),
): void {
  if (!Object.keys(quotes).length) return
  writeSessionCacheEnvelope(WATCHLIST_QUOTES_KEY, quotes, cachedAtMs)
}

export type PortfolioSummarySessionCache = {
  data: PortfolioSummaryData
  cached_at_ms: number
}

export function readPortfolioSummarySessionCache(): PortfolioSummarySessionCache | null {
  const hit = readSessionCacheEnvelope(PORTFOLIO_SUMMARY_KEY, isPortfolioSummary)
  if (!hit) return null
  return { data: hit.data, cached_at_ms: hit.cached_at_ms }
}

export function writePortfolioSummarySessionCache(
  data: PortfolioSummaryData,
  cachedAtMs = Date.now(),
): void {
  writeSessionCacheEnvelope(PORTFOLIO_SUMMARY_KEY, data, cachedAtMs)
}
