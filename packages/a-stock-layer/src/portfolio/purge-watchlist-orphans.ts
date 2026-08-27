import type { AssetClass, InstrumentRef, Market, PortfolioGlobalFees, InstrumentFeeOverrides } from '@opptrix/shared'
import { getUserDataStore } from '@opptrix/user-store'
import type { WatchlistItem } from '../watchlist/models.js'
import { normalizeWatchlistItem } from '../watchlist/instrument.js'
import type { TradeRecord } from './trade-models.js'
import {
  inferTradeAssetClass,
  portfolioCodeAliases,
  portfolioCodesMatch,
  portfolioDisplayCode,
} from './instrument.js'

/** 幂等：删除当前关注列表中已不存在的组合成交残留 */
export const PORTFOLIO_PURGE_WATCHLIST_ORPHANS_V1 = 'portfolio_purge_watchlist_orphans_v1'

const WATCHLIST_NAMESPACE = 'watchlist'
const WATCHLIST_DOC_ID = 'default'

function portfolioLedgerFamiliesMatch(a: AssetClass, b: AssetClass): boolean {
  const isFund = (x: AssetClass) => x === 'FUND'
  if (isFund(a) || isFund(b)) return isFund(a) && isFund(b)
  if (a === 'INDEX' || b === 'INDEX') return a === b
  return true
}

function legacyTradeMarket(trade: TradeRecord): Market {
  return trade.market ?? 'CN'
}

function collectFeeKeysForRef(code: string, market: Market, assetClass: AssetClass): Set<string> {
  const keys = new Set<string>()
  for (const alias of portfolioCodeAliases(code, market, assetClass)) keys.add(alias)
  keys.add(portfolioDisplayCode(code, market, assetClass))
  return keys
}

function collectTradeFeeKeys(trade: TradeRecord): Set<string> {
  const tMarket = legacyTradeMarket(trade)
  const tAc = inferTradeAssetClass(trade.code, tMarket, trade.assetClass)
  return collectFeeKeysForRef(trade.code, tMarket, tAc)
}

function resolveWatchlistRef(item: WatchlistItem): InstrumentRef | null {
  return normalizeWatchlistItem(item).instrument ?? null
}

export function tradeMatchesWatchlistItem(trade: TradeRecord, item: WatchlistItem): boolean {
  const tMarket = legacyTradeMarket(trade)
  const tAc = inferTradeAssetClass(trade.code, tMarket, trade.assetClass)
  const normalized = normalizeWatchlistItem(item)
  const ref = normalized.instrument

  if (ref) {
    if (!portfolioLedgerFamiliesMatch(tAc, ref.assetClass)) return false
    if (portfolioCodesMatch(trade.code, tMarket, normalized.code, ref.market, tAc, ref.assetClass)) {
      return true
    }
    const opptrix = portfolioDisplayCode(ref.symbol, ref.market, ref.assetClass)
    if (trade.code === opptrix || trade.code === normalized.code) return true
    const aliases = portfolioCodeAliases(normalized.code, ref.market, ref.assetClass)
    const tDisplay = portfolioDisplayCode(trade.code, tMarket, tAc)
    return aliases.has(trade.code) || aliases.has(tDisplay)
  }

  const itemCode = normalized.code.trim()
  if (itemCode.startsWith('pending:')) {
    const pendingRaw = itemCode.slice('pending:'.length).trim()
    return pendingRaw
      ? portfolioCodesMatch(trade.code, tMarket, pendingRaw, undefined, tAc, undefined)
      : false
  }
  return portfolioCodesMatch(trade.code, tMarket, itemCode, undefined, tAc, undefined)
}

export function tradeMatchesAnyWatchlistItem(trade: TradeRecord, items: WatchlistItem[]): boolean {
  if (items.length === 0) return false
  return items.some(item => tradeMatchesWatchlistItem(trade, item))
}

export function loadWatchlistItemsForPurge(): WatchlistItem[] {
  try {
    const raw = getUserDataStore().getDocument<{ items?: WatchlistItem[] }>(
      WATCHLIST_NAMESPACE,
      WATCHLIST_DOC_ID,
    )
    if (!Array.isArray(raw?.items)) return []
    return raw.items.map(normalizeWatchlistItem)
  } catch {
    return []
  }
}

export interface PortfolioPurgeState {
  globalFees: PortfolioGlobalFees
  instrumentFees: Record<string, InstrumentFeeOverrides>
  trades: TradeRecord[]
  nextId: number
}

export function purgePortfolioWatchlistOrphans(
  state: PortfolioPurgeState,
  watchlistItems: WatchlistItem[],
): { state: PortfolioPurgeState; removedTrades: number } {
  const before = state.trades.length
  const keptTrades = state.trades.filter(t => tradeMatchesAnyWatchlistItem(t, watchlistItems))
  const removedTrades = before - keptTrades.length

  const keptFeeKeys = new Set<string>()
  for (const t of keptTrades) {
    for (const k of collectTradeFeeKeys(t)) keptFeeKeys.add(k)
  }
  for (const item of watchlistItems) {
    const ref = resolveWatchlistRef(item)
    if (!ref) continue
    const normalized = normalizeWatchlistItem(item)
    for (const k of collectFeeKeysForRef(normalized.code, ref.market, ref.assetClass)) {
      keptFeeKeys.add(k)
    }
  }

  const nextFees: Record<string, InstrumentFeeOverrides> = {}
  for (const [key, overrides] of Object.entries(state.instrumentFees)) {
    if (keptFeeKeys.has(key)) nextFees[key] = overrides
  }

  return {
    state: {
      ...state,
      trades: keptTrades,
      instrumentFees: nextFees,
    },
    removedTrades,
  }
}
