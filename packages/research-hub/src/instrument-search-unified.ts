/** 统一标的搜索 — 本地名录（Tickflow 灌库）+ 扶摇/Tickflow 在线补强。 */

import type { Market } from '@opptrix/shared'
import {
  instrumentRefKey,
  type UnifiedInstrumentSearchHit,
  onlineHitToSearchHit,
} from '@opptrix/shared'
import type { MarketDataEngine } from '@opptrix/a-stock-layer'
import type { InstrumentSearchHit } from '@opptrix/a-stock-layer'
import type { MarketDataService } from '@opptrix/market-data-store'

export interface UnifiedSearchOptions {
  keyword: string
  limit?: number
  markets?: Market[]
  /**
   * 是否合并本地名录；默认 true（HK/US 中文名依赖 Tickflow 成分库）。
   * 传 false 可仅测在线源。
   */
  includeLocal?: boolean
}

export async function searchInstrumentsUnified(
  de: MarketDataEngine,
  marketData: MarketDataService,
  opts: UnifiedSearchOptions,
): Promise<{ items: UnifiedInstrumentSearchHit[]; sources: string[] }> {
  const keyword = opts.keyword.trim()
  const limit = Math.min(Math.max(opts.limit ?? 30, 1), 50)
  if (!keyword) return { items: [], sources: [] }

  const seen = new Set<string>()
  const merged: UnifiedInstrumentSearchHit[] = []
  const sources = new Set<string>()
  const includeLocal = opts.includeLocal !== false

  if (includeLocal) {
    const localHits = marketData.searchLocalInstruments(keyword, Math.max(limit * 2, limit), opts.markets)
    for (const hit of localHits) {
      const key = instrumentRefKey(hit.instrument)
      if (seen.has(key)) continue
      seen.add(key)
      merged.push({
        instrument: hit.instrument,
        code: hit.code,
        ref_label: hit.refLabel,
        name: hit.name,
        market: hit.market,
        asset_class: hit.assetClass,
        exchange: hit.exchange,
        source: 'local',
      })
      sources.add('local')
    }
  }

  const {
    searchInstrumentsOnline,
    scoreInstrumentSearchHit,
  } = await import('@opptrix/a-stock-layer')
  const markets = opts.markets?.length
    ? opts.markets.filter(m => m === 'CN' || m === 'US' || m === 'HK')
    : undefined

  const onlineHits: InstrumentSearchHit[] = await searchInstrumentsOnline(
    de,
    keyword,
    Math.max(limit * 2, limit),
    markets,
  )

  for (const hit of onlineHits) {
    const normalized = onlineHitToSearchHit({
      ...hit,
      source: hit.source === 'stock_index' ? 'stock_index' : 'online',
    })
    const key = instrumentRefKey(normalized.instrument)
    if (seen.has(key)) continue
    seen.add(key)
    merged.push(normalized)
    sources.add(hit.source === 'stock_index' ? 'online' : hit.source)
  }

  const ranked = merged
    .map((hit, index) => ({
      hit,
      index,
      score: scoreInstrumentSearchHit(
        {
          code: hit.code,
          name: hit.name,
          market: hit.market,
          assetClass: hit.asset_class,
          exchange: hit.exchange,
          instrument: hit.instrument,
          refLabel: hit.ref_label,
          source: hit.source === 'local' ? 'online' : hit.source,
        },
        keyword,
      ),
    }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map(x => x.hit)

  return {
    items: ranked.slice(0, limit),
    sources: [...sources],
  }
}
