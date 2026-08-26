/** 统一标的搜索 — 仅 OpptrixQuant 在线（须配置数据密钥）。 */

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
}

export async function searchInstrumentsUnified(
  de: MarketDataEngine,
  opts: UnifiedSearchOptions,
): Promise<{ items: UnifiedInstrumentSearchHit[]; sources: string[] }> {
  const keyword = opts.keyword.trim()
  const limit = Math.min(Math.max(opts.limit ?? 30, 1), 50)
  if (!keyword) return { items: [], sources: [] }

  const seen = new Set<string>()
  const merged: UnifiedInstrumentSearchHit[] = []
  const sources = new Set<string>()

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
          source: hit.source === 'stock_index' ? 'stock_index' : 'online',
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
