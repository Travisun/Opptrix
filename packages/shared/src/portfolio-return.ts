import type { TradeSide } from './portfolio-fees.js'

/** 列表/组合可展示的收益率绝对值上限（超出视为单位或数据异常） */
export const PORTFOLIO_RETURN_SANE_ABS_MAX = 500

export function isSanePortfolioReturnPct(pct: number | null | undefined): boolean {
  return pct != null && Number.isFinite(pct) && Math.abs(pct) <= PORTFOLIO_RETURN_SANE_ABS_MAX
}

export function sanitizePortfolioReturnPct(pct: number | null | undefined): number | null {
  if (pct == null || !Number.isFinite(pct) || Math.abs(pct) > PORTFOLIO_RETURN_SANE_ABS_MAX) return null
  return pct
}

/** 当日涨跌幅 — 异常 changePct 时用现价/昨收重算 */
export function dayChangeReturnPct(
  changePct: number | null | undefined,
  price: number | null | undefined,
  preClose: number | null | undefined,
): number | null {
  if (price != null && preClose != null && preClose > 0) {
    const derived = Math.round(((price - preClose) / preClose) * 10000) / 100
    if (changePct != null && Number.isFinite(changePct) && isSanePortfolioReturnPct(changePct)) {
      return changePct
    }
    return derived
  }
  if (changePct != null && Number.isFinite(changePct) && isSanePortfolioReturnPct(changePct)) {
    return changePct
  }
  return null
}

export function followReturnPct(
  currentPrice: number | null | undefined,
  addedPrice: number | null | undefined,
): number | null {
  if (currentPrice == null || addedPrice == null || addedPrice <= 0) return null
  const ratio = currentPrice / addedPrice
  if (ratio > 50 || ratio < 0.02) return null
  const pct = ((currentPrice - addedPrice) / addedPrice) * 100
  return isSanePortfolioReturnPct(pct) ? Math.round(pct * 100) / 100 : null
}

export type HoldingReturnInputs = {
  shares: number
  totalCost?: number
  realizedPnl?: number
  totalPnlPct?: number | null
  unrealizedPnlPct?: number | null
  currentPrice?: number | null
}

/** 持仓收益率（含已实现）— 与 PortfolioManager.calcPnlForStock 口径一致 */
export function holdingReturnPctFromQuote(
  holding: HoldingReturnInputs | null | undefined,
  price: number | null | undefined,
): number | null {
  if (!holding || holding.shares <= 0) return null
  const livePrice = price ?? holding.currentPrice
  if (livePrice == null || !Number.isFinite(livePrice)) {
    const cached = sanitizePortfolioReturnPct(holding.totalPnlPct)
      ?? sanitizePortfolioReturnPct(holding.unrealizedPnlPct)
    return cached
  }
  const totalCost = holding.totalCost ?? 0
  const realizedPnl = holding.realizedPnl ?? 0
  const marketValue = livePrice * holding.shares
  const unrealizedPnl = marketValue - totalCost
  const totalPnl = unrealizedPnl + realizedPnl
  if (totalCost > 0 && marketValue > 0 && totalCost >= marketValue * 0.001) {
    const pct = (totalPnl / totalCost) * 100
    const sane = sanitizePortfolioReturnPct(pct)
    if (sane != null) return Math.round(sane * 100) / 100
  }
  return sanitizePortfolioReturnPct(holding.totalPnlPct)
    ?? sanitizePortfolioReturnPct(holding.unrealizedPnlPct)
}

/** 组合行 / 抽屉：统一展示持仓总收益率 */
export function displayPortfolioHoldingReturnPct(
  holding: HoldingReturnInputs | null | undefined,
  livePrice?: number | null,
): number | null {
  return holdingReturnPctFromQuote(holding, livePrice ?? holding?.currentPrice)
}

/** 关注列表行收益率：持仓 > 关注加入价 > 当日涨跌 */
export function watchlistDisplayReturnPct(input: {
  isHolding?: boolean
  holding?: HoldingReturnInputs | null
  addedPrice?: number | null
  price?: number | null
  changePct?: number | null
  preClose?: number | null
}): number | null {
  const isHolding = input.isHolding ?? ((input.holding?.shares ?? 0) > 0)
  if (isHolding) {
    const hp = holdingReturnPctFromQuote(input.holding, input.price)
    if (hp != null) return hp
  }
  if (!isHolding && input.addedPrice != null && input.addedPrice > 0) {
    const fp = followReturnPct(input.price, input.addedPrice)
    const day = dayChangeReturnPct(input.changePct, input.price, input.preClose)
    if (fp != null && day != null && isSanePortfolioReturnPct(day)) {
      if (Math.abs(fp - day) > 15) return day
    }
    if (fp != null) return fp
  }
  return dayChangeReturnPct(input.changePct, input.price, input.preClose)
}

/** 单笔成交 — 持仓盈亏计算输入（服务端 TradeRecord / 客户端 PortfolioTradeItem 共用） */
export type PortfolioTradeLot = {
  id?: number
  tradeSide: TradeSide
  shares: number
  price: number
  amount: number
  totalFee: number
  tradeDate: string
}

export interface PortfolioHoldingCalcResult {
  shares: number
  costBasis: number
  totalCost: number
  unrealizedPnl: number
  unrealizedPnlPct: number
  realizedPnl: number
  totalPnl: number
  totalPnlPct: number
}

/**
 * 加权成本 + 已实现盈亏 — PortfolioManager 与 client portfolioCalc 唯一实现。
 */
export function calcHoldingPnlFromTrades(
  trades: PortfolioTradeLot[],
  currentPrice: number,
): PortfolioHoldingCalcResult {
  const sorted = [...trades].sort((a, b) => a.tradeDate.localeCompare(b.tradeDate) || (a.id ?? 0) - (b.id ?? 0))
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
    totalPnlPct: totalCost > 0
      ? Math.round((totalPnl / totalCost) * 10000) / 100
      : 0,
  }
}
