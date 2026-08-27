import type { InstrumentRef } from '@opptrix/shared'
import { normalizeInstrumentRef } from '@opptrix/shared'
import type { WatchlistItem } from '../watchlist/models.js'
import { WatchlistStore } from '../watchlist/store.js'
import { portfolioDisplayCode } from './instrument.js'
import { tradeMatchesWatchlistItem } from './purge-watchlist-orphans.js'
import type { HoldingPosition, TradeRecord } from './trade-models.js'

function watchlistItems(): WatchlistItem[] {
  return WatchlistStore.getInstance().list()
}

/** 成交 / 持仓行 → 关注项（身份与展示名权威源） */
export function findWatchlistItemForTrade(
  trade: Pick<TradeRecord, 'code' | 'market' | 'assetClass'>,
): WatchlistItem | null {
  const items = watchlistItems()
  if (!items.length) return null
  const stub = trade as TradeRecord
  return items.find(item => tradeMatchesWatchlistItem(stub, item)) ?? null
}

export function findWatchlistItemForRef(ref: InstrumentRef): WatchlistItem | null {
  const code = portfolioDisplayCode(ref.symbol, ref.market, ref.assetClass)
  return findWatchlistItemForTrade({
    code,
    market: ref.market,
    assetClass: ref.assetClass,
  })
}

export function watchlistItemDisplayName(item: WatchlistItem | null | undefined): string {
  return item?.name?.trim() ?? ''
}

/** 组合持仓展示字段 — 名称与 Opptrix code 以关注为准 */
export function applyWatchlistToHolding(
  pos: HoldingPosition,
  item: WatchlistItem | null,
): void {
  if (!item) return
  const name = watchlistItemDisplayName(item)
  if (name) pos.name = name
  const code = item.code?.trim()
  if (code) pos.code = code
  if (item.instrument?.market && item.instrument.symbol) {
    pos.instrument = normalizeInstrumentRef(item.instrument)
    pos.market = pos.instrument.market
    pos.assetClass = pos.instrument.assetClass
  }
}
