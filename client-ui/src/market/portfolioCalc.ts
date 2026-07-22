import type { PortfolioTradeItem } from '../types/schemas'

export type TradeSide = 'buy' | 'sell'

/** A-share default fee config (commission min 5, stamp duty on sell). */
export const DEFAULT_FEE_CONFIG = {
  commissionRate: 0.00025,
  commissionMin: 5,
  stampDutyRate: 0.0005,
  transferFeeRate: 0.00001,
}

function calcFees(amount: number, side: TradeSide) {
  const cfg = DEFAULT_FEE_CONFIG
  const commission = Math.max(amount * cfg.commissionRate, cfg.commissionMin)
  const stampDuty = side === 'sell' ? amount * cfg.stampDutyRate : 0
  const transferFee = amount * cfg.transferFeeRate
  return {
    commission: Math.round(commission * 100) / 100,
    stampDuty: Math.round(stampDuty * 100) / 100,
    transferFee: Math.round(transferFee * 100) / 100,
    totalFee: Math.round((commission + stampDuty + transferFee) * 100) / 100,
  }
}

export interface HoldingCalcResult {
  shares: number
  costBasis: number
  totalCost: number
  unrealizedPnl: number
  unrealizedPnlPct: number
  realizedPnl: number
  totalPnl: number
  totalPnlPct: number
}

/** Weighted-average cost + realized PnL — matches server PortfolioManager. */
export function calcHoldingFromTrades(
  trades: PortfolioTradeItem[],
  currentPrice: number,
): HoldingCalcResult {
  const sorted = [...trades].sort((a, b) => a.tradeDate.localeCompare(b.tradeDate) || a.id - b.id)
  let shares = 0
  let totalCost = 0
  let realizedPnl = 0

  for (const t of sorted) {
    if (t.tradeSide === 'buy') {
      totalCost += t.amount + t.totalFee
      shares += t.shares
    } else {
      if (shares <= 0) continue
      const sellShares = Math.min(t.shares, shares)
      const avgCost = shares > 0 ? totalCost / shares : 0
      realizedPnl += (t.price - avgCost) * sellShares - t.totalFee
      totalCost -= avgCost * sellShares
      shares -= sellShares
    }
  }

  const costBasis = shares > 0 ? totalCost / shares : 0
  const marketValue = shares * currentPrice
  const unrealizedPnl = marketValue - totalCost
  const totalPnl = unrealizedPnl + realizedPnl

  return {
    shares: Math.round(shares * 100) / 100,
    costBasis: Math.round(costBasis * 1000) / 1000,
    totalCost: Math.round(totalCost * 100) / 100,
    unrealizedPnl: Math.round(unrealizedPnl * 100) / 100,
    unrealizedPnlPct: totalCost > 0 ? Math.round((unrealizedPnl / totalCost) * 10000) / 100 : 0,
    realizedPnl: Math.round(realizedPnl * 100) / 100,
    totalPnl: Math.round(totalPnl * 100) / 100,
    totalPnlPct: totalCost > 0 || realizedPnl !== 0
      ? Math.round((totalPnl / (totalCost + Math.abs(realizedPnl))) * 10000) / 100
      : 0,
  }
}

export function estimateTradeAmount(shares: number, price: number) {
  return Math.round(shares * price * 100) / 100
}

export function estimateTradeFees(shares: number, price: number, side: TradeSide) {
  return calcFees(estimateTradeAmount(shares, price), side)
}

export function followReturnPct(
  currentPrice: number | null | undefined,
  addedPrice: number | null | undefined,
): number | null {
  if (currentPrice == null || addedPrice == null || addedPrice <= 0) return null
  return Math.round(((currentPrice - addedPrice) / addedPrice) * 10000) / 100
}

/** Minimal holding fields needed to recompute total return from a live quote. */
export type HoldingReturnInputs = {
  shares: number
  totalCost?: number
  realizedPnl?: number
  totalPnlPct?: number | null
  unrealizedPnlPct?: number | null
}

/**
 * Recompute holding total return % from the current quote price — same formula as
 * server `calcPnlForStock` / `calcHoldingFromTrades`. Falls back to server pct when
 * price is missing.
 */
export function holdingReturnPctFromQuote(
  holding: HoldingReturnInputs | null | undefined,
  price: number | null | undefined,
): number | null {
  if (!holding || holding.shares <= 0) return null
  if (price == null || !Number.isFinite(price)) {
    return holding.totalPnlPct ?? holding.unrealizedPnlPct ?? null
  }
  const totalCost = holding.totalCost ?? 0
  const realizedPnl = holding.realizedPnl ?? 0
  const unrealizedPnl = price * holding.shares - totalCost
  const totalPnl = unrealizedPnl + realizedPnl
  if (totalCost > 0 || realizedPnl !== 0) {
    return Math.round((totalPnl / (totalCost + Math.abs(realizedPnl))) * 10000) / 100
  }
  return 0
}
