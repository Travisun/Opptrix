/** 统一标的搜索 — 本地名录优先，在线 StockIndex / 数据源补充。 */

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
  /** 是否合并本地名录；默认 false（本地基础库已停用） */
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
  const items: UnifiedInstrumentSearchHit[] = []
  const sources = new Set<string>()

  if (opts.includeLocal === true) {
    const localHits = marketData.searchLocalInstruments(keyword, limit, opts.markets)
    for (const hit of localHits) {
      const key = instrumentRefKey(hit.instrument)
      if (seen.has(key)) continue
      seen.add(key)
      items.push({
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
