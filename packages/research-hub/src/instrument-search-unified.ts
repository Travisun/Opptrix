/** 统一标的搜索 — 在线 StockIndex / 数据源主路径。 */

import type { Market } from '@opptrix/shared'
import {
  instrumentRefKey,
  type UnifiedInstrumentSearchHit,
  onlineHitToSearchHit,
} from '@opptrix/shared'
import type { MarketDataEngine } from '@opptrix/a-stock-layer'
import type { InstrumentSearchHit } from '@opptrix/a-stock-layer'

export interface UnifiedSearchOptions {
  keyword: string
  limit?: number
  markets?: Market[]
  /** @deprecated 本地库已停用，忽略此参数 */
  includeLocal?: boolean
}

export async function searchInstrumentsUnified(
  de: MarketDataEngine,
  _marketData: unknown,
  opts: UnifiedSearchOptions,
): Promise<{ items: UnifiedInstrumentSearchHit[]; sources: string[] }> {
  const keyword = opts.keyword.trim()
  const limit = Math.min(Math.max(opts.limit ?? 30, 1), 50)
  if (!keyword) return { items: [], sources: [] }

  const { searchInstrumentsOnline } = await import('@opptrix/a-stock-layer')
  const markets = opts.markets?.length
    ? opts.markets.filter(m => m === 'CN' || m === 'US' || m === 'HK')
    : undefined

  const onlineHits: InstrumentSearchHit[] = await searchInstrumentsOnline(
    de,
    keyword,
    limit,
    markets,
  )

  const seen = new Set<string>()
  const items: UnifiedInstrumentSearchHit[] = []
  const sources = new Set<string>()

  for (const hit of onlineHits) {
    const normalized = onlineHitToSearchHit(hit)
    const key = instrumentRefKey(normalized.instrument)
    if (seen.has(key)) continue
    seen.add(key)
    items.push(normalized)
    sources.add(hit.source)
  }

  return {
    items: items.slice(0, limit),
    sources: [...sources],
  }
}
