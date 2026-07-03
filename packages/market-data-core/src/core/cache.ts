import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

/** Default TTL seconds — mirrors aaashare DEFAULT_TTL */
export const DEFAULT_TTL: Record<string, number> = {
  stock_kline: 3600,
  stock_money_flow: 3600,
  index_kline: 3600,
  stock_realtime: 0,
  index_realtime: 0,
  market_money_flow: 3600,
  sector_money_flow: 3600,
  stock_profile: 86400,
  financial_summary: 86400,
  news: 3600,
  dividend: 86400,
  dragon_tiger: 3600,
  stock_list: 86400,
  trade_calendar: 2592000,
  global_index: 0,
  limit_updown: 0,
  market_breadth: 0,
  sentiment: 0,
  intraday_tick: 0,
  /** Crypto 7×24 — short TTL for realtime, moderate for kline */
  crypto_realtime: 30,
  crypto_kline: 300,
}

interface Entry { data: unknown; expires: number }

/** In-memory + JSON file persistent cache (aaashare Cache port) */
export class Cache {
  private store = new Map<string, Entry>()
  private filePath: string

  constructor(dbPath?: string) {
    this.filePath = dbPath ?? path.join(os.homedir(), '.aaashare', 'cache.json')
    this.load()
  }

  private load() {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = JSON.parse(fs.readFileSync(this.filePath, 'utf8')) as Record<string, Entry>
        const now = Date.now()
        for (const [k, v] of Object.entries(raw)) {
          if (v.expires > now) this.store.set(k, v)
        }
      }
    } catch { /* fresh cache */ }
  }

  private persist() {
    try {
      const dir = path.dirname(this.filePath)
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
      fs.writeFileSync(this.filePath, JSON.stringify(Object.fromEntries(this.store), null, 2))
    } catch { /* ignore */ }
  }

  private key(cacheType: string, method: string, params: Record<string, unknown>) {
    return `${cacheType}:${method}:${JSON.stringify(params)}`
  }

  get<T>(cacheType: string, method: string, params: Record<string, unknown>): T | null {
    const ttl = DEFAULT_TTL[cacheType] ?? 3600
    if (ttl <= 0) return null
    const e = this.store.get(this.key(cacheType, method, params))
    if (!e || Date.now() > e.expires) return null
    return e.data as T
  }

  set(cacheType: string, data: unknown, method: string, params: Record<string, unknown>) {
    const ttl = DEFAULT_TTL[cacheType] ?? 3600
    if (ttl <= 0) return
    this.store.set(this.key(cacheType, method, params), {
      data, expires: Date.now() + ttl * 1000,
    })
    this.persist()
  }

  clearType(cacheType: string) {
    let n = 0
    for (const k of [...this.store.keys()]) {
      if (k.startsWith(`${cacheType}:`)) { this.store.delete(k); n++ }
    }
    this.persist()
    return n
  }

  clearAll() {
    const n = this.store.size
    this.store.clear()
    this.persist()
    return n
  }

  stats() {
    const stats: Record<string, { count: number }> = {}
    for (const k of this.store.keys()) {
      const t = k.split(':')[0]
      stats[t] = { count: (stats[t]?.count ?? 0) + 1 }
    }
    return stats
  }
}

/** @deprecated use Cache */
export class MemoryCache {
  private store = new Map<string, Entry>()
  get<T>(key: string) {
    const e = this.store.get(key)
    if (!e || Date.now() > e.expires) return null
    return e.data as T
  }
  set<T>(key: string, data: T, ttlMs = 60_000) {
    this.store.set(key, { data, expires: Date.now() + ttlMs })
  }
  key(type: string, method: string, params: Record<string, string | number>) {
    return `${type}:${method}:${JSON.stringify(params)}`
  }
}
