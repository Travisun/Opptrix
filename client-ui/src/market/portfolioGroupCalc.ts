import type { PortfolioSummaryData } from '../types/schemas'
import type { WatchlistItem } from '../types/market'
import { filterWatchlistByGroup } from './WatchlistGroupsContext'
import { lookupHoldingSnapshot } from './portfolioCalc'
import type { HoldingSnapshot } from './useFollowPortfolio'
import { instrumentKey, resolveWatchlistInstrument, watchlistItemKey } from './instrument'
import { isSanePortfolioReturnPct } from '@opptrix/shared/portfolio-return'

type HoldingRow = PortfolioSummaryData['holdings'][number]

export type PortfolioScopeSummary = Pick<
  PortfolioSummaryData,
  | 'totalCost'
  | 'totalMarketValue'
  | 'totalUnrealizedPnl'
  | 'totalRealizedPnl'
  | 'totalPnl'
  | 'totalPnlPct'
  | 'holdingsCount'
>

function holdingCost(row: HoldingRow): number {
  if (typeof row.totalCost === 'number' && Number.isFinite(row.totalCost)) return row.totalCost
  return row.costBasis * row.shares
}

function holdingTotalPnl(row: HoldingRow): number {
  if (typeof row.totalPnl === 'number' && Number.isFinite(row.totalPnl)) return row.totalPnl
  return row.unrealizedPnl + (row.realizedPnl ?? 0)
}

/** 对持仓子集汇总市值与盈亏（分组 / 筛选视图） */
export function aggregatePortfolioScopeSummary(holdings: HoldingRow[]): PortfolioScopeSummary {
  let totalCost = 0
  let totalMarketValue = 0
  let totalUnrealizedPnl = 0
  let totalRealizedPnl = 0
  let totalPnl = 0
  for (const row of holdings) {
    if (!row.shares || row.shares <= 0) continue
    totalCost += holdingCost(row)
    totalMarketValue += row.marketValue
    totalUnrealizedPnl += row.unrealizedPnl
    totalRealizedPnl += row.realizedPnl ?? 0
    totalPnl += holdingTotalPnl(row)
  }
  const rawPct = totalCost > 0 ? (totalPnl / totalCost) * 100 : 0
  const totalPnlPct = isSanePortfolioReturnPct(rawPct) ? rawPct : 0
  return {
    totalCost,
    totalMarketValue,
    totalUnrealizedPnl,
    totalRealizedPnl,
    totalPnl,
    totalPnlPct,
    holdingsCount: holdings.filter(h => h.shares > 0).length,
  }
}

/** 按关注分组筛持仓；顺序与关注列表一致；「全部」保留服务端全量持仓 */
export function resolvePortfolioHoldingsForGroup(
  allHoldings: HoldingRow[],
  watchlistItems: WatchlistItem[],
  membership: Record<string, string[]>,
  selectedGroupId: string | null,
  holdingsByCode: Record<string, HoldingSnapshot>,
): HoldingRow[] {
  if (!selectedGroupId) return allHoldings

  const filteredItems = filterWatchlistByGroup(
    watchlistItems,
    membership,
    selectedGroupId,
    watchlistItemKey,
  )
  const seen = new Set<string>()
  const rows: HoldingRow[] = []

  for (const item of filteredItems) {
    const ref = resolveWatchlistInstrument(item)
    if (!ref) continue
    const snap = lookupHoldingSnapshot(holdingsByCode, ref)
    if (!snap || snap.shares <= 0) continue
    const key = instrumentKey(ref)
    if (seen.has(key)) continue
    seen.add(key)
    rows.push(snap)
  }

  // 分组内无关注项时仍允许按 code 兜底（历史数据仅有持仓、未进关注）
  if (!rows.length && filteredItems.length === 0) {
    return []
  }

  return rows
}
