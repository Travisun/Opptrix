import { getUserDataStore } from '@opptrix/user-store'
import type { FeeConfig, TradeRecord } from './models.js'
import { DEFAULT_FEE_CONFIG } from './models.js'

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

function tradeCodeAliases(code: string): Set<string> {
  const trimmed = code.trim()
  const aliases = new Set<string>([trimmed, trimmed.toUpperCase()])
  if (/^\d+$/.test(trimmed)) aliases.add(trimmed.padStart(6, '0'))
  return aliases
}

function tradeCodesOverlap(code: string, aliases: Set<string>): boolean {
  for (const alias of tradeCodeAliases(code)) {
    if (aliases.has(alias)) return true
  }
  return false
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

  getStockConfig(code: string): Partial<FeeConfig> {
    return { ...(this.state.stockConfig[code.padStart(6, '0')] ?? {}) }
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

  /** Remove all trades and per-stock fee overrides for one instrument code. */
  deleteTradesForCode(code: string): number {
    const aliases = tradeCodeAliases(code)
    const before = this.state.trades.length
    this.state.trades = this.state.trades.filter(t => !tradeCodesOverlap(t.code, aliases))
    for (const key of aliases) {
      if (/^\d{6}$/.test(key)) delete this.state.stockConfig[key]
    }
    this.save()
    return before - this.state.trades.length
  }

  getTrades(code = ''): TradeRecord[] {
    if (code) {
      const c = code.padStart(6, '0')
      return this.state.trades
        .filter(t => t.code === c)
        .sort((a, b) => a.tradeDate.localeCompare(b.tradeDate) || a.id - b.id)
    }
    return [...this.state.trades].sort((a, b) => b.tradeDate.localeCompare(a.tradeDate) || b.id - a.id).slice(0, 500)
  }

  clearAll() {
    const n = this.state.trades.length
    this.state.trades = []
    this.save()
    return n
  }
}
