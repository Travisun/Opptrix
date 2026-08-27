import type { PortfolioSummaryData } from '../types/schemas'
import type { WatchlistItem } from '../types/market'
import { instrumentKey, resolveWatchlistInstrument } from './instrument'
import { portfolioHoldingRef } from './useFollowPortfolio'

type HoldingRow = PortfolioSummaryData['holdings'][number]

/** 持仓行 → 关注项（名称 / Opptrix ID 权威源） */
export function findWatchlistItemForHolding(
  row: HoldingRow,
  items: WatchlistItem[],
): WatchlistItem | undefined {
  const ref = portfolioHoldingRef(row)
  const key = instrumentKey(ref)
  return items.find(item => {
    const itemRef = resolveWatchlistInstrument(item)
    return itemRef != null && instrumentKey(itemRef) === key
  })
}

export function portfolioHoldingDisplayName(
  row: HoldingRow,
  items: WatchlistItem[],
): string {
  const fromWatchlist = findWatchlistItemForHolding(row, items)?.name?.trim()
  if (fromWatchlist) return fromWatchlist
  return row.name?.trim() || row.code
}

export function portfolioHoldingDisplayCode(
  row: HoldingRow,
  items: WatchlistItem[],
): string {
  const fromWatchlist = findWatchlistItemForHolding(row, items)?.code?.trim()
  if (fromWatchlist) return fromWatchlist
  return row.code
}
