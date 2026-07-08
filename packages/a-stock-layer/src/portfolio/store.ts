import type { Market } from '@opptrix/shared'
import { getUserDataStore } from '@opptrix/user-store'
import type { FeeConfig, TradeRecord } from './models.js'
import { DEFAULT_FEE_CONFIG } from './models.js'
import {
  portfolioCodeAliases,
  portfolioCodesMatch,
  portfolioDisplayCode,
  portfolioInstrumentRef,
} from './instrument.js'

const NAMESPACE = 'portfolio'
const DOC_ID = 'default'

interface DbState {
  config: FeeConfig
  stockConfig: Record<string, Partial<FeeConfig>>
  trades: TradeRecord[]
  nextId: number
}

function defaultState(): DbState {
  return { config: { ...DEFAULT_FEE_CONFIG }, stockConfig: {}, trades: [], nextId: 1 }
}

function legacyTradeMarket(trade: TradeRecord): Market {
  return trade.market ?? 'CN'
}

export class PortfolioStore {
  private static inst: PortfolioStore | null = null
  private state: DbState

  private constructor() {
    this.state = this.load()
  }

  static getInstance() {
    if (!PortfolioStore.inst) PortfolioStore.inst = new PortfolioStore()
    return PortfolioStore.inst
  }

  private load(): DbState {
    try {
      const raw = getUserDataStore().getDocument<DbState>(NAMESPACE, DOC_ID)
      if (raw) return { ...defaultState(), ...raw, trades: raw.trades ?? [] }
    } catch { /* reset */ }
    return defaultState()
  }

  private save() {
    getUserDataStore().setDocument(NAMESPACE, DOC_ID, this.state)
  }

  getConfig(): FeeConfig {
    return { ...this.state.config }
  }

  getStockConfig(code: string, market?: Market): Partial<FeeConfig> {
    const key = portfolioDisplayCode(code, market)
    return { ...(this.state.stockConfig[key] ?? {}) }
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
      delete this.state.stockConfig[alias]
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
