import type { AshareEngine } from '../engine.js'
import type { FeeConfig, HoldingPosition, PnLSummary, TradeRecord, TradeSide } from './models.js'
import { PortfolioStore } from './store.js'

function calcFees(amount: number, side: TradeSide, cfg: FeeConfig) {
  const commission = Math.max(amount * cfg.commissionRate, cfg.commissionMin)
  const stampDuty = side === 'sell' ? amount * cfg.stampDutyRate : 0
  const transferFee = amount * cfg.transferFeeRate
  return {
    commission: Math.round(commission * 100) / 100,
    stampDuty: Math.round(stampDuty * 100) / 100,
    transferFee: Math.round(transferFee * 100) / 100,
  }
}

function calcPnlForStock(trades: TradeRecord[], currentPrice: number): HoldingPosition {
  let shares = 0
  let totalCost = 0
  let realizedPnl = 0

  for (const t of trades) {
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
    code: trades[0]?.code ?? '',
    name: trades[0]?.name ?? '',
    shares: Math.round(shares * 100) / 100,
    costBasis: Math.round(costBasis * 1000) / 1000,
    totalCost: Math.round(totalCost * 100) / 100,
    currentPrice: Math.round(currentPrice * 100) / 100,
    marketValue: Math.round(marketValue * 100) / 100,
    unrealizedPnl: Math.round(unrealizedPnl * 100) / 100,
    unrealizedPnlPct: totalCost > 0 ? Math.round((unrealizedPnl / totalCost) * 10000) / 100 : 0,
    realizedPnl: Math.round(realizedPnl * 100) / 100,
    totalPnl: Math.round(totalPnl * 100) / 100,
    totalPnlPct: totalCost > 0 || realizedPnl !== 0
      ? Math.round((totalPnl / (totalCost + Math.abs(realizedPnl))) * 10000) / 100
      : 0,
  }
}

export class PortfolioManager {
  private store = PortfolioStore.getInstance()

  constructor(private engine?: AshareEngine) {}

  private feeConfig(code: string): FeeConfig {
    const global = this.store.getConfig()
    const stock = this.store.getStockConfig(code)
    return {
      commissionRate: stock.commissionRate ?? global.commissionRate,
      commissionMin: stock.commissionMin ?? global.commissionMin,
      stampDutyRate: stock.stampDutyRate ?? global.stampDutyRate,
      transferFeeRate: stock.transferFeeRate ?? global.transferFeeRate,
    }
  }

  private async resolveName(code: string, name = '') {
    if (name || !this.engine) return name
    try {
      const r = await this.engine.realtime(code)
      return r.data?.[0]?.name ?? name
    } catch {
      return name
    }
  }

  async buy(code: string, shares: number, price: number, date = '', name = '') {
    const tradeDate = date || new Date().toISOString().slice(0, 10)
    const c = code.padStart(6, '0')
    const amount = Math.round(shares * price * 100) / 100
    const fees = calcFees(amount, 'buy', this.feeConfig(c))
    const stockName = await this.resolveName(c, name)
    const totalFee = fees.commission + fees.stampDuty + fees.transferFee
    const id = this.store.addTrade({
      code: c, name: stockName, tradeSide: 'buy', shares, price, amount,
      commission: fees.commission, stampDuty: fees.stampDuty, transferFee: fees.transferFee,
      totalFee: Math.round(totalFee * 100) / 100, tradeDate,
    })
    return { id, code: c, name: stockName, tradeSide: 'buy' as const, shares, price, amount, tradeDate }
  }

  async sell(code: string, shares: number, price: number, date = '', name = '') {
    const tradeDate = date || new Date().toISOString().slice(0, 10)
    const c = code.padStart(6, '0')
    const amount = Math.round(shares * price * 100) / 100
    const fees = calcFees(amount, 'sell', this.feeConfig(c))
    const stockName = await this.resolveName(c, name)
    const totalFee = fees.commission + fees.stampDuty + fees.transferFee
    const id = this.store.addTrade({
      code: c, name: stockName, tradeSide: 'sell', shares, price, amount,
      commission: fees.commission, stampDuty: fees.stampDuty, transferFee: fees.transferFee,
      totalFee: Math.round(totalFee * 100) / 100, tradeDate,
    })
    return { id, code: c, name: stockName, tradeSide: 'sell' as const, shares, price, amount, tradeDate }
  }

  trades(code = '') { return this.store.getTrades(code) }

  async holdings(refreshPrices = true): Promise<HoldingPosition[]> {
    const all = this.store.getTrades()
    const byCode = new Map<string, TradeRecord[]>()
    for (const t of all) {
      if (!byCode.has(t.code)) byCode.set(t.code, [])
      byCode.get(t.code)!.push(t)
    }

    const results: HoldingPosition[] = []
    for (const [, ts] of byCode) {
      let price = ts[ts.length - 1].price
      if (refreshPrices && this.engine) {
        try {
          const r = await this.engine.realtime(ts[0].code)
          if (r.success && r.data?.[0]?.price != null) price = r.data[0].price!
        } catch { /* keep last trade price */ }
      }
      const pos = calcPnlForStock(ts, price)
      if (pos.shares > 0) results.push(pos)
    }
    return results
  }

  async summary(refreshPrices = true): Promise<PnLSummary> {
    const holdings = await this.holdings(refreshPrices)
    const totalCost = holdings.reduce((a, h) => a + h.totalCost, 0)
    const totalMarketValue = holdings.reduce((a, h) => a + h.marketValue, 0)
    const totalUnrealizedPnl = holdings.reduce((a, h) => a + h.unrealizedPnl, 0)
    const totalRealizedPnl = holdings.reduce((a, h) => a + h.realizedPnl, 0)
    const totalPnl = totalUnrealizedPnl + totalRealizedPnl
    return {
      totalCost: Math.round(totalCost * 100) / 100,
      totalMarketValue: Math.round(totalMarketValue * 100) / 100,
      totalUnrealizedPnl: Math.round(totalUnrealizedPnl * 100) / 100,
      totalRealizedPnl: Math.round(totalRealizedPnl * 100) / 100,
      totalPnl: Math.round(totalPnl * 100) / 100,
      totalPnlPct: totalCost > 0 ? Math.round((totalPnl / totalCost) * 10000) / 100 : 0,
      holdingsCount: holdings.length,
      tradesCount: this.store.getTrades().length,
      holdings,
    }
  }

  removeTrade(id: number) { return this.store.deleteTrade(id) }

  /** Drop ledger rows and per-stock fee overrides when a watchlist symbol is removed. */
  clearInstrument(code: string) {
    const removed = this.store.deleteTradesForCode(code)
    return { removed }
  }

  clear() { return this.store.clearAll() }
}
