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

const DEFAULT_MAX_ENTRIES = 1200
const DEFAULT_MAX_APPROX_BYTES = 80 * 1024 * 1024
const DEFAULT_PERSIST_DEBOUNCE_MS = 1500
/** Single entry above this stays in memory LRU but is omitted from disk (avoids cache.json bloat). */
const DEFAULT_MAX_DISK_ENTRY_BYTES = 1.5 * 1024 * 1024

export interface CacheOptions {
  /** Cap on live entries (default 1200; env OPPTRIX_CACHE_MAX_ENTRIES). */
  maxEntries?: number
  /** Rough JSON-size budget in bytes (default 80MB; env OPPTRIX_CACHE_MAX_BYTES). */
  maxApproxBytes?: number
  /** Debounce window for disk flush (default 1500ms). */
  persistDebounceMs?: number
  /**
   * Entries whose serialized payload exceeds this stay in the in-memory LRU
   * but are **not** written to disk. Restart loses them (caller re-fetches).
   */
  maxDiskEntryBytes?: number
  /** Skip process beforeExit flush hook (tests). */
  disableExitFlush?: boolean
}

interface Entry {
  data: unknown
  expires: number
  source?: string
  /** Rough serialized size; memory-only, not written to disk. */
  approxBytes: number
}

interface DiskEntry {
  data: unknown
  expires: number
  source?: string
}

export type CacheStats = {
  entries: number
  approxBytes: number
  [cacheType: string]: number | { count: number }
}

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (!raw?.trim()) return fallback
  const n = Number.parseInt(raw.trim(), 10)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

/** Stop refining once we already know the entry is huge (LRU / disk-omit still work). */
const ESTIMATE_HARD_CAP = 64 * 1024 * 1024
const ESTIMATE_ARRAY_SAMPLE = 8
const ESTIMATE_OBJECT_KEY_SAMPLE = 12
/** Below this UTF-16 length, full stringify of a small root object is still cheap. */
const ESTIMATE_SMALL_STRINGIFY_CHARS = 4096

/**
 * Rough serialized size for LRU / approxBytes stats — avoids `JSON.stringify` on every
 * large payload. Prefer typed sizes, array/object sampling + extrapolation, and a hard
 * cap short-circuit. Not exact JSON bytes; intentionally ~O(sample) for big klines.
 */
function estimateBytes(data: unknown, depth = 0): number {
  if (data === null || data === undefined) return 4
  if (typeof data === 'boolean') return 5
  if (typeof data === 'number') return 16
  if (typeof data === 'bigint') return 24
  if (typeof data === 'string') return 2 + Buffer.byteLength(data, 'utf8')
  if (typeof data === 'function' || typeof data === 'symbol') return 32
  if (Buffer.isBuffer(data)) return data.byteLength
  if (data instanceof Uint8Array) return data.byteLength
  if (data instanceof ArrayBuffer) return data.byteLength
  if (depth > 6) return 256

  if (Array.isArray(data)) {
    const n = data.length
    if (n === 0) return 2
    const sample = Math.min(n, ESTIMATE_ARRAY_SAMPLE)
    let sum = 0
    for (let i = 0; i < sample; i++) {
      sum += estimateBytes(data[i], depth + 1)
      if (sum >= ESTIMATE_HARD_CAP) return ESTIMATE_HARD_CAP
    }
    const approx = Math.ceil((sum / sample) * n) + n + 2
    return Math.min(ESTIMATE_HARD_CAP, approx)
  }

  if (typeof data === 'object') {
    const obj = data as Record<string, unknown>
    const keys = Object.keys(obj)
    if (keys.length === 0) return 2

    // Tiny root objects: exact size is cheap and keeps disk-omit thresholds accurate.
    if (depth === 0 && keys.length <= 8) {
      try {
        const s = JSON.stringify(data)
        if (s.length <= ESTIMATE_SMALL_STRINGIFY_CHARS) {
          return Buffer.byteLength(s, 'utf8')
        }
      } catch {
        /* fall through to sampling */
      }
    }

    const sample = Math.min(keys.length, ESTIMATE_OBJECT_KEY_SAMPLE)
    let sum = 0
    for (let i = 0; i < sample; i++) {
      const k = keys[i]!
      sum += Buffer.byteLength(k, 'utf8') + 4 + estimateBytes(obj[k], depth + 1)
      if (sum >= ESTIMATE_HARD_CAP) return ESTIMATE_HARD_CAP
    }
    return Math.min(ESTIMATE_HARD_CAP, Math.ceil((sum / sample) * keys.length) + 2)
  }

  return 256
}

/** In-memory LRU + debounced JSON file cache (aaashare Cache port). */
export class Cache {
  private store = new Map<string, Entry>()
  private filePath: string
  private readonly maxEntries: number
  private readonly maxApproxBytes: number
  private readonly persistDebounceMs: number
  private readonly maxDiskEntryBytes: number
  private approxBytesTotal = 0
  private dirty = false
  private persistTimer: ReturnType<typeof setTimeout> | null = null
  private onBeforeExit: (() => void) | null = null
  /** Test/observability: how many times the disk file was written. */
  persistWriteCount = 0

  constructor(dbPath?: string, options?: CacheOptions) {
    this.filePath = dbPath ?? path.join(os.homedir(), '.aaashare', 'cache.json')
    this.maxEntries = options?.maxEntries
      ?? parsePositiveInt(process.env.OPPTRIX_CACHE_MAX_ENTRIES, DEFAULT_MAX_ENTRIES)
    this.maxApproxBytes = options?.maxApproxBytes
      ?? parsePositiveInt(process.env.OPPTRIX_CACHE_MAX_BYTES, DEFAULT_MAX_APPROX_BYTES)
    this.persistDebounceMs = options?.persistDebounceMs ?? DEFAULT_PERSIST_DEBOUNCE_MS
    this.maxDiskEntryBytes = options?.maxDiskEntryBytes ?? DEFAULT_MAX_DISK_ENTRY_BYTES
    this.load()
    if (!options?.disableExitFlush && typeof process !== 'undefined' && typeof process.on === 'function') {
      this.onBeforeExit = () => {
        this.flush()
      }
      process.on('beforeExit', this.onBeforeExit)
    }
  }

  /** Drop exit hook + pending timer (tests / explicit dispose). */
  dispose() {
    if (this.persistTimer) {
      clearTimeout(this.persistTimer)
      this.persistTimer = null
    }
    if (this.onBeforeExit) {
      process.off('beforeExit', this.onBeforeExit)
    }
  }

  private load() {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = JSON.parse(fs.readFileSync(this.filePath, 'utf8')) as Record<string, DiskEntry>
        const now = Date.now()
        for (const [k, v] of Object.entries(raw)) {
          if (!v || typeof v.expires !== 'number' || v.expires <= now) continue
          const approxBytes = estimateBytes(v.data)
          this.store.set(k, {
            data: v.data,
            expires: v.expires,
            source: v.source,
            approxBytes,
          })
          this.approxBytesTotal += approxBytes
        }
        this.enforceLimits()
      }
    } catch {
      /* fresh cache */
    }
  }

  /**
   * Compact JSON to disk (no indent). Skips oversized entries — they remain
   * in the in-memory LRU only so cache.json cannot explode from one huge payload.
   */
  private writeDisk() {
    try {
      const dir = path.dirname(this.filePath)
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
      const now = Date.now()
      const payload: Record<string, DiskEntry> = {}
      for (const [k, e] of this.store) {
        if (e.expires <= now) continue
        // Large entries: memory-only; omit from disk intentionally.
        if (e.approxBytes > this.maxDiskEntryBytes) continue
        const disk: DiskEntry = { data: e.data, expires: e.expires }
        if (e.source !== undefined) disk.source = e.source
        payload[k] = disk
      }
      fs.writeFileSync(this.filePath, JSON.stringify(payload))
      this.persistWriteCount += 1
      this.dirty = false
    } catch {
      /* ignore */
    }
  }

  /** Immediate disk flush (cancels pending debounce). Used by clear* and tests. */
  flush() {
    if (this.persistTimer) {
      clearTimeout(this.persistTimer)
      this.persistTimer = null
    }
    if (this.dirty) this.writeDisk()
  }

  private schedulePersist() {
    this.dirty = true
    if (this.persistDebounceMs <= 0) {
      this.writeDisk()
      return
    }
    if (this.persistTimer) return
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null
      if (this.dirty) this.writeDisk()
    }, this.persistDebounceMs)
    // Do not keep the process alive solely for cache flush; beforeExit still flushes.
    this.persistTimer.unref?.()
  }

  private flushNow() {
    this.dirty = true
    if (this.persistTimer) {
      clearTimeout(this.persistTimer)
      this.persistTimer = null
    }
    this.writeDisk()
  }

  private key(cacheType: string, method: string, params: Record<string, unknown>) {
    return `${cacheType}:${method}:${JSON.stringify(params)}`
  }

  private deleteEntry(k: string) {
    const e = this.store.get(k)
    if (!e) return
    this.approxBytesTotal = Math.max(0, this.approxBytesTotal - e.approxBytes)
    this.store.delete(k)
  }

  /** Evict expired first, then least-recently-used until under caps. */
  private enforceLimits() {
    const now = Date.now()
    for (const [k, e] of [...this.store.entries()]) {
      if (e.expires <= now) this.deleteEntry(k)
    }
    while (this.store.size > this.maxEntries) {
      const oldest = this.store.keys().next().value
      if (oldest === undefined) break
      this.deleteEntry(oldest)
    }
    // Keep at least the newest entry even if it alone exceeds the byte budget.
    while (this.approxBytesTotal > this.maxApproxBytes && this.store.size > 1) {
      const oldest = this.store.keys().next().value
      if (oldest === undefined) break
      this.deleteEntry(oldest)
    }
  }

  /** Move key to most-recently-used position (Map insertion order). */
  private touch(k: string, e: Entry) {
    this.store.delete(k)
    this.store.set(k, e)
  }

  get<T>(cacheType: string, method: string, params: Record<string, unknown>): T | null {
    const ttl = DEFAULT_TTL[cacheType] ?? 3600
    return this.getWithTtl<T>(cacheType, method, params, ttl)
  }

  getWithTtl<T>(
    cacheType: string,
    method: string,
    params: Record<string, unknown>,
    ttlSeconds: number,
  ): T | null {
    if (ttlSeconds <= 0) return null
    const k = this.key(cacheType, method, params)
    const e = this.store.get(k)
    if (!e) return null
    if (Date.now() > e.expires) {
      this.deleteEntry(k)
      return null
    }
    this.touch(k, e)
    return e.data as T
  }

  set(
    cacheType: string,
    data: unknown,
    method: string,
    params: Record<string, unknown>,
    source?: string,
  ) {
    const ttl = DEFAULT_TTL[cacheType] ?? 3600
    this.setWithTtl(cacheType, data, method, params, ttl, source)
  }

  setWithTtl(
    cacheType: string,
    data: unknown,
    method: string,
    params: Record<string, unknown>,
    ttlSeconds: number,
    source?: string,
  ) {
    if (ttlSeconds <= 0) return
    const k = this.key(cacheType, method, params)
    const approxBytes = estimateBytes(data)
    const prev = this.store.get(k)
    if (prev) {
      this.approxBytesTotal = Math.max(0, this.approxBytesTotal - prev.approxBytes)
      this.store.delete(k)
    }
    this.store.set(k, {
      data,
      expires: Date.now() + ttlSeconds * 1000,
      source,
      approxBytes,
    })
    this.approxBytesTotal += approxBytes
    this.enforceLimits()
    this.schedulePersist()
  }

  /** Drop cached rows produced by a specific provider (reload / uninstall). */
  clearBySource(source: string) {
    let n = 0
    for (const [k, e] of [...this.store.entries()]) {
      if (e.source === source) {
        this.deleteEntry(k)
        n++
      }
    }
    if (n) this.flushNow()
    return n
  }

  clearType(cacheType: string) {
    let n = 0
    for (const k of [...this.store.keys()]) {
      if (k.startsWith(`${cacheType}:`)) {
        this.deleteEntry(k)
        n++
      }
    }
    this.flushNow()
    return n
  }

  clearAll() {
    const n = this.store.size
    this.store.clear()
    this.approxBytesTotal = 0
    this.flushNow()
    return n
  }

  stats(): CacheStats {
    const byType: Record<string, { count: number }> = {}
    for (const k of this.store.keys()) {
      const t = k.split(':')[0] ?? 'unknown'
      byType[t] = { count: (byType[t]?.count ?? 0) + 1 }
    }
    return {
      ...byType,
      entries: this.store.size,
      approxBytes: this.approxBytesTotal,
    } as CacheStats
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
    this.store.set(key, { data, expires: Date.now() + ttlMs, approxBytes: estimateBytes(data) })
  }
  key(type: string, method: string, params: Record<string, string | number>) {
    return `${type}:${method}:${JSON.stringify(params)}`
  }
}
