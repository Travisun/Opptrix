import type { InstrumentRef, Market } from '@opptrix/shared'
import type { AshareEngine } from '../engine.js'
import type { FeeConfig, HoldingPosition, PnLSummary, TradeRecord, TradeSide } from './models.js'
import {
  portfolioDisplayCode,
  portfolioInstrumentRef,
  portfolioLedgerKey,
} from './instrument.js'
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
  const first = trades[0]

  return {
    code: first?.code ?? '',
    name: first?.name ?? '',
    market: first?.market,
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

  private feeConfig(code: string, market?: Market): FeeConfig {
    const global = this.store.getConfig()
    const stock = this.store.getStockConfig(code, market)
    return {
      commissionRate: stock.commissionRate ?? global.commissionRate,
      commissionMin: stock.commissionMin ?? global.commissionMin,
      stampDutyRate: stock.stampDutyRate ?? global.stampDutyRate,
      transferFeeRate: stock.transferFeeRate ?? global.transferFeeRate,
    }
  }

  private equityRef(code: string, market?: Market): InstrumentRef {
    return portfolioInstrumentRef(code, market)
  }

  private async resolveName(ref: InstrumentRef, name = '') {
    if (name || !this.engine) return name
    try {
      const r = await this.engine.queryInstrumentData(ref, 'realtime')
      const rows = 'data' in r && Array.isArray(r.data) ? r.data : []
      const row = rows[0] as { name?: unknown } | undefined
      return row?.name != null ? String(row.name) : name
    } catch {
      return name
    }
  }

  private async fetchRealtimePrice(ref: InstrumentRef): Promise<number | null> {
    if (!this.engine) return null
    try {
      const r = await this.engine.queryInstrumentData(ref, 'realtime')
      const rows = 'data' in r && Array.isArray(r.data) ? r.data : []
      const row = rows[0] as { price?: unknown } | undefined
      const price = row?.price
      return price != null && Number.isFinite(Number(price)) ? Number(price) : null
    } catch {
      return null
    }
  }

  async buy(
    code: string,
    shares: number,
    price: number,
    date = '',
    name = '',
    market?: Market,
  ) {
    const ref = this.equityRef(code, market)
    const displayCode = portfolioDisplayCode(code, ref.market)
    const tradeDate = date || new Date().toISOString().slice(0, 10)
    const amount = Math.round(shares * price * 100) / 100
    const fees = calcFees(amount, 'buy', this.feeConfig(displayCode, ref.market))
    const stockName = await this.resolveName(ref, name)
    const totalFee = fees.commission + fees.stampDuty + fees.transferFee
    const id = this.store.addTrade({
      code: displayCode,
      market: ref.market,
      name: stockName,
      tradeSide: 'buy',
      shares,
      price,
      amount,
      commission: fees.commission,
      stampDuty: fees.stampDuty,
      transferFee: fees.transferFee,
      totalFee: Math.round(totalFee * 100) / 100,
      tradeDate,
    })
    return {
      id,
      code: displayCode,
      market: ref.market,
      name: stockName,
      tradeSide: 'buy' as const,
      shares,
      price,
      amount,
      tradeDate,
    }
  }

  async sell(
    code: string,
    shares: number,
    price: number,
    date = '',
    name = '',
    market?: Market,
  ) {
    const ref = this.equityRef(code, market)
    const displayCode = portfolioDisplayCode(code, ref.market)
    const tradeDate = date || new Date().toISOString().slice(0, 10)
    const amount = Math.round(shares * price * 100) / 100
    const fees = calcFees(amount, 'sell', this.feeConfig(displayCode, ref.market))
    const stockName = await this.resolveName(ref, name)
    const totalFee = fees.commission + fees.stampDuty + fees.transferFee
    const id = this.store.addTrade({
      code: displayCode,
      market: ref.market,
      name: stockName,
      tradeSide: 'sell',
      shares,
      price,
      amount,
      commission: fees.commission,
      stampDuty: fees.stampDuty,
      transferFee: fees.transferFee,
      totalFee: Math.round(totalFee * 100) / 100,
      tradeDate,
    })
    return {
      id,
      code: displayCode,
      market: ref.market,
      name: stockName,
      tradeSide: 'sell' as const,
      shares,
      price,
      amount,
      tradeDate,
    }
  }

  trades(code = '', market?: Market) {
    return this.store.getTrades(code, market)
  }

  async holdings(refreshPrices = true): Promise<HoldingPosition[]> {
    const all = this.store.getTrades()
    const byKey = new Map<string, TradeRecord[]>()
    for (const t of all) {
      const key = portfolioLedgerKey(t.code, t.market)
      if (!byKey.has(key)) byKey.set(key, [])
      byKey.get(key)!.push(t)
    }

    const results: HoldingPosition[] = []
    for (const [, ts] of byKey) {
      ts.sort((a, b) => a.tradeDate.localeCompare(b.tradeDate) || a.id - b.id)
      let price = ts[ts.length - 1]!.price
      if (refreshPrices && this.engine) {
        const ref = portfolioInstrumentRef(ts[0]!.code, ts[0]!.market)
        const live = await this.fetchRealtimePrice(ref)
        if (live != null) price = live
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
  clearInstrument(code: string, market?: Market) {
    const removed = this.store.deleteTradesForCode(code, market)
    return { removed }
  }

  clear() { return this.store.clearAll() }
}
