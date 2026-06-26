import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { FeeConfig, TradeRecord } from './models.js'
import { DEFAULT_FEE_CONFIG } from './models.js'

const DB_DIR = path.join(os.homedir(), '.a_stock_layer')
const DB_FILE = path.join(DB_DIR, 'portfolio.json')

interface DbState {
  config: FeeConfig
  stockConfig: Record<string, Partial<FeeConfig>>
  trades: TradeRecord[]
  nextId: number
}

function defaultState(): DbState {
  return { config: { ...DEFAULT_FEE_CONFIG }, stockConfig: {}, trades: [], nextId: 1 }
}

export class PortfolioStore {
  private static inst: PortfolioStore | null = null
  private state: DbState

  private constructor() {
    fs.mkdirSync(DB_DIR, { recursive: true })
    this.state = this.load()
  }

  static getInstance() {
    if (!PortfolioStore.inst) PortfolioStore.inst = new PortfolioStore()
    return PortfolioStore.inst
  }

  private load(): DbState {
    try {
      if (fs.existsSync(DB_FILE)) {
        const raw = JSON.parse(fs.readFileSync(DB_FILE, 'utf8')) as DbState
        return { ...defaultState(), ...raw, trades: raw.trades ?? [] }
      }
    } catch { /* reset */ }
    return defaultState()
  }

  private save() {
    fs.writeFileSync(DB_FILE, JSON.stringify(this.state, null, 2))
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
