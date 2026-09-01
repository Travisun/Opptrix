import { getUserDataStore } from '@opptrix/user-store'
import type { ResearchResult } from '@opptrix/shared'

const CACHE_NS = 'market_dynamics_cache'

export type MarketDynamicsCacheMarket = 'cn' | 'hk' | 'us'

export type MarketDynamicsCacheEntry = {
  cached_at: string
  cached_at_ms: number
  message: string
  data: Record<string, unknown>
}

export function normalizeMarketDynamicsMarket(raw: unknown): MarketDynamicsCacheMarket {
  const market = String(raw ?? 'cn').trim().toLowerCase()
  if (market === 'hk' || market === 'us') return market
  return 'cn'
}

export function readMarketDynamicsCache(market: MarketDynamicsCacheMarket): MarketDynamicsCacheEntry | null {
  try {
    const doc = getUserDataStore().getDocument<MarketDynamicsCacheEntry>(CACHE_NS, market)
    if (!doc?.data || typeof doc.cached_at_ms !== 'number') return null
    return doc
  } catch {
    return null
  }
}

export function writeMarketDynamicsCache(
  market: MarketDynamicsCacheMarket,
  result: ResearchResult,
): void {
  if (!result.success || result.data == null) return
  const entry: MarketDynamicsCacheEntry = {
    cached_at: new Date().toISOString(),
    cached_at_ms: Date.now(),
    message: result.message ?? '',
    data: result.data as Record<string, unknown>,
  }
  getUserDataStore().setDocument(CACHE_NS, market, entry)
}

export function resetMarketDynamicsCacheForTests(): void {
  const store = getUserDataStore()
  for (const market of ['cn', 'hk', 'us'] as const) {
    store.deleteDocument(CACHE_NS, market)
  }
}
