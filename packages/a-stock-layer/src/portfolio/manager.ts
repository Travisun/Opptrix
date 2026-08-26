import type { AssetClass, InstrumentRef, Market } from '@opptrix/shared'
import {
  resolveInstrumentQuotePrice,
  calcHoldingPnlFromTrades,
  resolvePortfolioProfile,
} from '@opptrix/shared'
import type { AshareEngine } from '../engine.js'
import type { HoldingPosition, PnLSummary, TradeRecord, TradeSide } from './trade-models.js'
import {
  calcFeesFromSettings,
  resolvePortfolioLedgerKind,
} from './models.js'
import {
  inferTradeAssetClass,
  portfolioDisplayCode,
  portfolioInstrumentRef,
  portfolioLedgerKey,
} from './instrument.js'
import { PortfolioStore } from './store.js'

export type PortfolioTradeOpts = {
  date?: string
  name?: string
  market?: Market
  assetClass?: AssetClass
  /** 完整 InstrumentRef；优先于 code+market+assetClass */
  instrument?: InstrumentRef
}

function calcPnlForStock(trades: TradeRecord[], currentPrice: number): HoldingPosition {
  const first = trades[0]
  const calc = calcHoldingPnlFromTrades(trades, currentPrice)
  const roundedPrice = Math.round(currentPrice * 100) / 100
  const assetClass = first
    ? inferTradeAssetClass(first.code, first.market, first.assetClass)
    : undefined
  return {
    code: first?.code ?? '',
    name: first?.name ?? '',
    market: first?.market,
    assetClass,
    shares: calc.shares,
    costBasis: calc.costBasis,
    totalCost: calc.totalCost,
    currentPrice: roundedPrice,
    marketValue: Math.round(calc.shares * roundedPrice * 100) / 100,
    unrealizedPnl: calc.unrealizedPnl,
    unrealizedPnlPct: calc.unrealizedPnlPct,
    realizedPnl: calc.realizedPnl,
    totalPnl: calc.totalPnl,
    totalPnlPct: calc.totalPnlPct,
  }
}

export class PortfolioManager {
  private store = PortfolioStore.getInstance()

  constructor(private engine?: AshareEngine) {}

  private resolveTradeRef(
    code: string,
    market?: Market,
    assetClass?: AssetClass,
    instrument?: InstrumentRef,
  ): InstrumentRef {
    if (instrument) return portfolioInstrumentRef(instrument)
    return portfolioInstrumentRef(code, market, assetClass)
  }

  private markCapability(ref: InstrumentRef): 'realtime' | 'fund_quote' {
    return resolvePortfolioProfile(ref).markCapability
  }

  private async resolveName(ref: InstrumentRef, name = '') {
    if (name || !this.engine) return name
    try {
      const r = await this.engine.queryInstrumentData(ref, this.markCapability(ref))
      const rows = 'data' in r && Array.isArray(r.data) ? r.data : []
      const row = rows[0] as { name?: unknown } | undefined
      return row?.name != null ? String(row.name) : name
    } catch {
      return name
    }
  }

  /**
   * 始终经 queryInstrumentData(正确 ref)。
   * FUND → fund_quote（禁止对 FUND 用 A 股 realtime 裸码）。
   */
  private async fetchRealtimePrice(ref: InstrumentRef): Promise<number | null> {
    if (!this.engine) return null
    try {
      const r = await this.engine.queryInstrumentData(ref, this.markCapability(ref))
      const rows = 'data' in r && Array.isArray(r.data) ? r.data : []
      const row = rows[0] as Record<string, unknown> | undefined
      const price = row ? resolveInstrumentQuotePrice(row) : null
      return price != null && Number.isFinite(price) ? price : null
    } catch {
      return null
    }
  }

  private tradeFees(ref: InstrumentRef, amount: number, side: TradeSide) {
    const feeCode = portfolioDisplayCode(ref.symbol, ref.market, ref.assetClass)
    const overrides = this.store.getInstrumentFees(feeCode, ref.market)
    const ledgerKind = overrides.ledgerKind
      ?? resolvePortfolioProfile(ref).ledgerKind
      ?? resolvePortfolioLedgerKind(ref)
    return calcFeesFromSettings(
      ledgerKind,
      amount,
      side,
      this.store.getGlobalFees(),
      overrides,
      ref.market,
    )
  }

  getGlobalFees() {
    return this.store.getGlobalFees()
  }

  setGlobalFees(globalFees: import('@opptrix/shared').PortfolioGlobalFees) {
    return this.store.setGlobalFees(globalFees)
  }

  getInstrumentFees(code: string, market?: Market, assetClass?: AssetClass) {
    const ref = this.resolveTradeRef(code, market, assetClass)
    const overrides = this.store.getInstrumentFees(
      portfolioDisplayCode(code, market, assetClass),
      market,
    )
    return {
      ledgerKind: overrides.ledgerKind
        ?? resolvePortfolioProfile(ref).ledgerKind
        ?? resolvePortfolioLedgerKind(ref),
      overrides,
      globalFees: this.store.getGlobalFees(),
    }
  }

  setInstrumentFees(
    code: string,
    overrides: import('@opptrix/shared').InstrumentFeeOverrides,
    market?: Market,
  ) {
    return this.store.setInstrumentFees(code, market, overrides)
  }

  async buy(
    code: string,
    shares: number,
    price: number,
    date = '',
    name = '',
    market?: Market,
    assetClass?: AssetClass,
  ) {
    return this.recordTrade('buy', code, shares, price, { date, name, market, assetClass })
  }

  async sell(
    code: string,
    shares: number,
    price: number,
    date = '',
    name = '',
    market?: Market,
    assetClass?: AssetClass,
  ) {
    return this.recordTrade('sell', code, shares, price, { date, name, market, assetClass })
  }

  /** 统一买卖入口 — 支持 assetClass / instrument，FUND/ETF 持久化类型 */
  async recordTrade(
    side: TradeSide,
    code: string,
    shares: number,
    price: number,
    opts: PortfolioTradeOpts = {},
  ) {
    const ref = this.resolveTradeRef(code, opts.market, opts.assetClass, opts.instrument)
    const displayCode = portfolioDisplayCode(code || ref.symbol, ref.market, ref.assetClass)
    const tradeDate = opts.date || new Date().toISOString().slice(0, 10)
    const amount = Math.round(shares * price * 100) / 100
    const fees = this.tradeFees(ref, amount, side)
    const stockName = await this.resolveName(ref, opts.name ?? '')
    const id = this.store.addTrade({
      code: displayCode,
      market: ref.market,
      assetClass: ref.assetClass,
      name: stockName,
      tradeSide: side,
      shares,
      price,
      amount,
      commission: fees.commission,
      stampDuty: fees.stampDuty,
      transferFee: fees.transferFee,
      totalFee: fees.totalFee,
      tradeDate,
    })
    return {
      id,
      code: displayCode,
      market: ref.market,
      assetClass: ref.assetClass,
      name: stockName,
      tradeSide: side,
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
      const ac = inferTradeAssetClass(t.code, t.market, t.assetClass)
      const key = portfolioLedgerKey(t.code, t.market, ac)
      if (!byKey.has(key)) byKey.set(key, [])
      byKey.get(key)!.push(t)
    }

    const results: HoldingPosition[] = []
    for (const [, ts] of byKey) {
      ts.sort((a, b) => a.tradeDate.localeCompare(b.tradeDate) || a.id - b.id)
      let price = ts[ts.length - 1]!.price
      const head = ts[0]!
      const ac = inferTradeAssetClass(head.code, head.market, head.assetClass)
      const ref = portfolioInstrumentRef(head.code, head.market, ac)
      if (refreshPrices && this.engine) {
        const profile = resolvePortfolioProfile(ref)
        if (profile.supportsPnl) {
          const live = await this.fetchRealtimePrice(ref)
          if (live != null) price = live
        }
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
