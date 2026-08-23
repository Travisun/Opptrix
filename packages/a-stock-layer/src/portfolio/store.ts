import type { Market } from '@opptrix/shared'
import type { InstrumentFeeOverrides, PortfolioGlobalFees } from '@opptrix/shared'
import { getUserDataStore } from '@opptrix/user-store'
import type { TradeRecord } from './trade-models.js'
import {
  DEFAULT_PORTFOLIO_GLOBAL_FEES,
  migrateLegacyFeeState,
} from './models.js'
import {
  portfolioCodeAliases,
  portfolioCodesMatch,
  portfolioDisplayCode,
} from './instrument.js'
import { recomputeAllTradeFees, recomputeTradeRecordFees } from './fee-recompute.js'

const NAMESPACE = 'portfolio'
const DOC_ID = 'default'
const FEE_MARKET_AWARE_KEY = 'portfolio_fee_market_aware_v1'

interface DbState {
  globalFees: PortfolioGlobalFees
  instrumentFees: Record<string, InstrumentFeeOverrides>
  trades: TradeRecord[]
  nextId: number
}

interface LegacyDbState {
  config?: Partial<import('./models.js').FeeConfig>
  stockConfig?: Record<string, Partial<import('./models.js').FeeConfig>>
  globalFees?: PortfolioGlobalFees
  instrumentFees?: Record<string, InstrumentFeeOverrides>
  trades?: TradeRecord[]
  nextId?: number
}

function defaultState(): DbState {
  return {
    globalFees: structuredClone(DEFAULT_PORTFOLIO_GLOBAL_FEES),
    instrumentFees: {},
    trades: [],
    nextId: 1,
  }
}

function legacyTradeMarket(trade: TradeRecord): Market {
  return trade.market ?? 'CN'
}

function normalizeLoadedState(raw: LegacyDbState): DbState {
  const base = defaultState()
  if (raw.globalFees) {
    return {
      globalFees: raw.globalFees,
      instrumentFees: raw.instrumentFees ?? {},
      trades: raw.trades ?? [],
      nextId: raw.nextId ?? 1,
    }
  }
  const migrated = migrateLegacyFeeState({
    config: raw.config,
    stockConfig: raw.stockConfig,
  })
  return {
    globalFees: migrated.globalFees,
    instrumentFees: migrated.instrumentFees,
    trades: raw.trades ?? [],
    nextId: raw.nextId ?? 1,
  }
}

export class PortfolioStore {
  private static inst: PortfolioStore | null = null
  private state: DbState

  private constructor() {
    const { state, feesMigrated } = this.load()
    this.state = state
    if (feesMigrated) this.save()
  }

  static getInstance() {
    if (!PortfolioStore.inst) PortfolioStore.inst = new PortfolioStore()
    return PortfolioStore.inst
  }

  private load(): { state: DbState; feesMigrated: boolean } {
    try {
      const raw = getUserDataStore().getDocument<LegacyDbState>(NAMESPACE, DOC_ID)
      if (raw) {
        const state = normalizeLoadedState(raw)
        const { state: next, migrated } = this.maybeRecomputeFeesForMarketFix(state)
        return { state: next, feesMigrated: migrated }
      }
    } catch { /* reset */ }
    return { state: defaultState(), feesMigrated: false }
  }

  /** 一次性按市场重算费率（修复美股等误用 A 股印花税的历史成交） */
  private maybeRecomputeFeesForMarketFix(state: DbState): { state: DbState; migrated: boolean } {
    const userStore = getUserDataStore()
    if (userStore.getMetaFlag(FEE_MARKET_AWARE_KEY)) return { state, migrated: false }
    const { trades, updated } = recomputeAllTradeFees(
      state.trades,
      state.globalFees,
      state.instrumentFees,
    )
    userStore.setMetaFlag(FEE_MARKET_AWARE_KEY)
    if (updated <= 0) return { state, migrated: false }
    return { state: { ...state, trades }, migrated: true }
  }

  private save() {
    getUserDataStore().setDocument(NAMESPACE, DOC_ID, this.state)
  }

  getGlobalFees(): PortfolioGlobalFees {
    return structuredClone(this.state.globalFees)
  }

  setGlobalFees(globalFees: PortfolioGlobalFees): { globalFees: PortfolioGlobalFees; recalculatedTrades: number } {
    this.state.globalFees = structuredClone(globalFees)
    const recalculatedTrades = this.recomputeAllTradeFees()
    this.save()
    return { globalFees: this.getGlobalFees(), recalculatedTrades }
  }

  private applyRecomputedTrades(trades: TradeRecord[], updated: number): number {
    if (updated <= 0) return 0
    this.state.trades = trades
    return updated
  }

  recomputeAllTradeFees(): number {
    const { trades, updated } = recomputeAllTradeFees(
      this.state.trades,
      this.state.globalFees,
      this.state.instrumentFees,
    )
    return this.applyRecomputedTrades(trades, updated)
  }

  recomputeTradeFeesForCode(code: string, market?: Market): number {
    let updated = 0
    const trades = this.state.trades.map(trade => {
      if (!portfolioCodesMatch(trade.code, legacyTradeMarket(trade), code, market)) return trade
      const next = recomputeTradeRecordFees(trade, this.state.globalFees, this.state.instrumentFees)
      if (
        next.commission !== trade.commission
        || next.stampDuty !== trade.stampDuty
        || next.transferFee !== trade.transferFee
        || next.totalFee !== trade.totalFee
      ) {
        updated += 1
      }
      return next
    })
    return this.applyRecomputedTrades(trades, updated)
  }

  setInstrumentFees(
    code: string,
    market: Market | undefined,
    overrides: InstrumentFeeOverrides,
  ): { overrides: InstrumentFeeOverrides; recalculatedTrades: number } {
    const key = portfolioDisplayCode(code, market)
    const next = structuredClone(overrides)
    const hasKeys = Object.keys(next).length > 0
    if (hasKeys) {
      this.state.instrumentFees[key] = next
    } else {
      delete this.state.instrumentFees[key]
    }
    const recalculatedTrades = this.recomputeTradeFeesForCode(code, market)
    this.save()
    return { overrides: this.getInstrumentFees(code, market), recalculatedTrades }
  }

  getInstrumentFees(code: string, market?: Market): InstrumentFeeOverrides {
    const key = portfolioDisplayCode(code, market)
    const overrides = this.state.instrumentFees[key]
    return overrides ? structuredClone(overrides) : {}
  }

  /** @deprecated 兼容旧调用 — 映射为 instrument overrides */
  getStockConfig(code: string, market?: Market): InstrumentFeeOverrides {
    return this.getInstrumentFees(code, market)
  }

  addTrade(rec: Omit<TradeRecord, 'id'>): number {
    const id = this.state.nextId++
    this.state.trades.push({ ...rec, id })
    this.save()
    return id
  }

  deleteTrade(id: number) {
    const before = this.state.trades.length
    this.state.trades = this.state.trades.filter(t => t.id !== id)
    this.save()
    return this.state.trades.length < before
  }

  /** Remove all trades and per-stock fee overrides when a watchlist symbol is removed. */
  deleteTradesForCode(code: string, market?: Market) {
    const before = this.state.trades.length
    this.state.trades = this.state.trades.filter(
      t => !portfolioCodesMatch(t.code, legacyTradeMarket(t), code, market),
    )
    for (const alias of portfolioCodeAliases(code, market)) {
      delete this.state.instrumentFees[alias]
    }
    this.save()
    return before - this.state.trades.length
  }

  getTrades(code = '', market?: Market): TradeRecord[] {
    const sorted = [...this.state.trades].sort(
      (a, b) => b.tradeDate.localeCompare(a.tradeDate) || b.id - a.id,
    )
    if (!code.trim()) return sorted.slice(0, 500)
    return sorted
      .filter(t => portfolioCodesMatch(t.code, legacyTradeMarket(t), code, market))
      .sort((a, b) => a.tradeDate.localeCompare(b.tradeDate) || a.id - b.id)
  }

  clearAll() {
    const n = this.state.trades.length
    this.state.trades = []
    this.save()
    return n
  }
}

export { portfolioInstrumentRef } from './instrument.js'
