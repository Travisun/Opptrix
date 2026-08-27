import type { WatchlistItem } from '../types/market'
import type { MarketQuote } from '../types/market'
import type { FxRatesToCny } from '@opptrix/shared/fx-rates'
import { convertMarketAmountToCny } from '@opptrix/shared/fx-rates'
import { resolvePortfolioProfile } from '@opptrix/shared/portfolio-profile'
import { filterWatchlistByGroup } from './WatchlistGroupsContext'
import { holdingReturnPctInCny, lookupHoldingSnapshot } from './portfolioCalc'
import type { HoldingSnapshot } from './useFollowPortfolio'
import { isSanePortfolioReturnPct } from '@opptrix/shared/portfolio-return'
import { resolveWatchlistInstrument, watchlistItemKey } from './instrument'

export function countWatchlistGroupMembers(
  items: WatchlistItem[],
  membership: Record<string, string[]>,
  groupId: string,
): number {
  return filterWatchlistByGroup(items, membership, groupId, watchlistItemKey).length
}

export type WatchlistGroupSummaryMetrics = {
  itemCount: number
  holdingCount: number
  holdingReturnPct: number | null
}

function lookupQuote(
  quotes: Record<string, MarketQuote>,
  item: WatchlistItem,
): MarketQuote | undefined {
  const ref = resolveWatchlistInstrument(item)
  if (ref) {
    const keyed = quotes[watchlistItemKey({ ...item, instrument: ref })]
    if (keyed) return keyed
  }
  return quotes[watchlistItemKey(item)] ?? quotes[item.code]
}

/** 组内持仓收益（人民币市值加权） */
export function computeWatchlistGroupSummary(
  items: WatchlistItem[],
  membership: Record<string, string[]>,
  selectedGroupId: string | null,
  quotes: Record<string, MarketQuote>,
  holdingsByCode: Record<string, HoldingSnapshot>,
  fxRates: FxRatesToCny | null,
): WatchlistGroupSummaryMetrics {
  const scoped = filterWatchlistByGroup(items, membership, selectedGroupId, watchlistItemKey)
  let holdingCount = 0
  let holdingWeightSum = 0
  let holdingWeightedPct = 0

  for (const item of scoped) {
    const ref = resolveWatchlistInstrument(item)
    if (!ref) continue
    // INDEX / 无 portfolio_pnl：不计入持仓收益加权
    if (!resolvePortfolioProfile(ref).supportsPnl) continue
    const quote = lookupQuote(quotes, item)
    const livePrice = quote?.price ?? null
    const holding = lookupHoldingSnapshot(holdingsByCode, ref)
    const shares = holding?.shares ?? 0
    if (shares <= 0 || !holding) continue
    holdingCount += 1

    const holdingPct = holdingReturnPctInCny(holding, livePrice, ref.market, fxRates)
    const localMv = holding.marketValue > 0
      ? holding.marketValue
      : (livePrice ?? holding.currentPrice ?? 0) * shares
    const mvCny = convertMarketAmountToCny(localMv, ref.market, fxRates)
    if (holdingPct != null && isSanePortfolioReturnPct(holdingPct) && mvCny > 0) {
      holdingWeightSum += mvCny
      holdingWeightedPct += holdingPct * mvCny
    }
  }

  const holdingReturnPctAgg = holdingWeightSum > 0 ? holdingWeightedPct / holdingWeightSum : null

  return {
    itemCount: scoped.length,
    holdingCount,
    holdingReturnPct: holdingReturnPctAgg != null && isSanePortfolioReturnPct(holdingReturnPctAgg)
      ? holdingReturnPctAgg
      : null,
  }
}
