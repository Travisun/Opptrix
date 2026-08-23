import type { InstrumentRef } from '../types/instrument'
import type { PortfolioGlobalFees, InstrumentFeeOverrides } from '@opptrix/shared/portfolio-fees'
import {
  DEFAULT_PORTFOLIO_GLOBAL_FEES,
  estimatePortfolioTradeFees,
  portfolioHoldingsStorageKey,
  type TradeSide,
} from '@opptrix/shared/portfolio-fees'
import {
  PORTFOLIO_RETURN_SANE_ABS_MAX,
  isSanePortfolioReturnPct,
  dayChangeReturnPct,
  followReturnPct,
  holdingReturnPctFromQuote,
  watchlistDisplayReturnPct,
  displayPortfolioHoldingReturnPct,
  calcHoldingPnlFromTrades,
  type HoldingReturnInputs,
  type PortfolioHoldingCalcResult,
} from '@opptrix/shared/portfolio-return'
import type { PortfolioTradeItem } from '../types/schemas'
import type { HoldingSnapshot } from './useFollowPortfolio'
import {
  instrumentKey,
  parseInstrumentInput,
  normalizeInstrumentRefLocal,
} from './instrument'

export type { TradeSide, HoldingReturnInputs }

/** @deprecated 使用 PORTFOLIO_RETURN_SANE_ABS_MAX */
export const WATCHLIST_RETURN_SANE_ABS_MAX = PORTFOLIO_RETURN_SANE_ABS_MAX

/** @deprecated 使用 isSanePortfolioReturnPct */
export const isSaneWatchlistReturnPct = isSanePortfolioReturnPct

export {
  dayChangeReturnPct,
  followReturnPct,
  holdingReturnPctFromQuote,
  watchlistDisplayReturnPct,
  displayPortfolioHoldingReturnPct,
}

export function holdingMatchesRef(
  holding: HoldingSnapshot,
  ref: InstrumentRef,
): boolean {
  const parsed = parseInstrumentInput(holding.code.trim())
  const hRef = parsed
    ? normalizeInstrumentRefLocal(parsed)
    : normalizeInstrumentRefLocal({
      market: (holding.market ?? 'CN') as InstrumentRef['market'],
      assetClass: 'EQUITY',
      symbol: holding.code.trim(),
    })
  return portfolioHoldingsStorageKey(hRef) === portfolioHoldingsStorageKey(ref)
}

export const DEFAULT_FEE_CONFIG = {
  commissionRate: 0.00025,
  commissionMin: 5,
  stampDutyRate: 0.0005,
  transferFeeRate: 0.00001,
}

export type HoldingCalcResult = PortfolioHoldingCalcResult

/** Weighted-average cost + realized PnL — 与 PortfolioManager 共用 shared 实现 */
export function calcHoldingFromTrades(
  trades: PortfolioTradeItem[],
  currentPrice: number,
): HoldingCalcResult {
  return calcHoldingPnlFromTrades(trades, currentPrice)
}

export function estimateTradeAmount(shares: number, price: number) {
  return Math.round(shares * price * 100) / 100
}

export function estimateTradeFees(
  ref: InstrumentRef,
  side: TradeSide,
  shares: number,
  price: number,
  globalFees: PortfolioGlobalFees = DEFAULT_PORTFOLIO_GLOBAL_FEES,
  overrides?: InstrumentFeeOverrides,
) {
  return estimatePortfolioTradeFees(ref, side, shares, price, globalFees, overrides)
}

/** 从 holdings map 按 InstrumentRef 解析持仓快照（严格匹配账本标的） */
export function lookupHoldingSnapshot(
  map: Record<string, HoldingSnapshot>,
  ref: InstrumentRef,
): HoldingSnapshot | undefined {
  const keys = [portfolioHoldingsStorageKey(ref), instrumentKey(ref)]
  for (const k of keys) {
    const row = k ? map[k] : undefined
    if (row && holdingMatchesRef(row, ref)) return row
  }
  return undefined
}
