/**
 * 统一标的搜索 — 在线 StockIndex 主路径 + 本地 SQLite 补充。
 *
 * 本地库对 A 股 Discover / 初选因子 / 离线场景很重要：
 * - 已同步 universe 内的代码、名称、行业
 * - 与 local_universe_screen / list_screen_factors 共用 stock_factors 数据
 * 不替代 local_universe_screen（因子组合筛选仍走专用 feature）。
 */

import type { Market } from '@opptrix/shared'
import {
  instrumentRefKey,
  type UnifiedInstrumentSearchHit,
  localHitToSearchHit,
  onlineHitToSearchHit,
} from '@opptrix/shared'
import type { MarketDataEngine } from '@opptrix/a-stock-layer'
import type { MarketDataService } from '@opptrix/market-data-store'
import type { InstrumentSearchHit } from '@opptrix/a-stock-layer'

export interface UnifiedSearchOptions {
  keyword: string
  limit?: number
  markets?: Market[]
  /** 本地库就绪时合并 v_instruments_unified 结果 */
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

  const includeLocal = opts.includeLocal !== false
  const localReady = marketData.status().is_ready
  if (includeLocal && localReady) {
    const localHits = marketData.searchLocalInstruments(keyword, limit, opts.markets)
    for (const hit of localHits) {
      const normalized = localHitToSearchHit(hit)
      const key = instrumentRefKey(normalized.instrument)
      if (seen.has(key)) continue
      seen.add(key)
      items.push(normalized)
      sources.add('local')
    }
  }

  return {
    items: items.slice(0, limit),
    sources: [...sources],
  }
}
