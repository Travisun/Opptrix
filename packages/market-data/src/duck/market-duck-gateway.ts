/**
 * Market DuckDB 统一访问层 — 单写者多读者、Worker 线程 + p-queue 调度。
 *
 * 所有 market.duckdb 读写必须经此 Gateway（禁止主进程 execFileSync）。
 * SQLite market.db 仍为 sync 控制面（WAL + 只读连接），由 MarketDataStore 管理。
 */
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import Database from 'better-sqlite3'
import type { StockKline } from '@opptrix/shared'
import { klineDuckDbPath, marketDbPath } from '../paths.js'
import { normalizeStockCode } from '../utils.js'
import { isDuckPrimaryMigrationComplete } from './duck-primary-migration.js'
import type { DuckWriteOp } from './market-writes.js'
import {
  DUCK_READ_PRIORITY_BACKGROUND,
  DUCK_READ_PRIORITY_INTERACTIVE,
  getDuckCliPool,
  resetDuckCliPools,
} from './duck-cli-pool.js'
import { getDuckNeoReader, resetDuckNeoReaders } from './duck-neo-reader.js'

export type AnalyticsSyncScope = 'dims' | 'quotes' | 'factors' | 'scores' | 'financials' | 'all'

const CLI_PATH = fileURLToPath(new URL('../kline/duck-cli.js', import.meta.url))

export type MarketDuckStats = {
  stocks: number
  instruments: number
  taxonomy: number
  quotes: number
  factors: number
  klines: number
  kline_codes: number
  kline_codes_min60: number
  profiles: number
  etf: number
  cn_equity: number
  hk_equity: number
  us_equity: number
  announcements: number
  dividends: number
  partners: number
  segments: number
  shareholders: number
  forecasts: number
  inst_holdings: number
  insider_trades: number
  buybacks: number
}

export type KlineDuckStats = {
  rows: number
  codes: number
  maxDate: string | null
}

const EMPTY_MARKET_STATS: MarketDuckStats = {
  stocks: 0, instruments: 0, taxonomy: 0, quotes: 0, factors: 0, klines: 0,
  kline_codes: 0, kline_codes_min60: 0, profiles: 0, etf: 0,
  cn_equity: 0, hk_equity: 0, us_equity: 0,
  announcements: 0, dividends: 0, partners: 0, segments: 0,
  shareholders: 0, forecasts: 0, inst_holdings: 0, insider_trades: 0, buybacks: 0,
}

let duckDataCache: { at: number; path: string; has: boolean } | null = null

export function invalidateHasMarketDuckDataCache(duckDbPath?: string): void {
  if (!duckDbPath) {
    duckDataCache = null
    return
  }
  if (duckDataCache?.path === duckDbPath) duckDataCache = null
}

export class MarketDuckGateway {
  /** 进程内 async 操作串行队列（避免 spawn 与 sync 交错） */
  private asyncChain: Promise<void> = Promise.resolve()

  constructor(
    readonly duckDbPath = klineDuckDbPath(),
    readonly sqliteDbPath = marketDbPath(),
  ) {}

  private schedule<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.asyncChain.then(fn)
    this.asyncChain = run.then(() => undefined, () => undefined)
    return run
  }

  private cliPool() {
    return getDuckCliPool(this.duckDbPath)
  }

  private execCliRead(
    args: string[],
    maxBuffer = 128 * 1024 * 1024,
    priority = DUCK_READ_PRIORITY_BACKGROUND,
  ): Promise<string> {
    return this.cliPool().exec(args, 'read', { maxBuffer, priority })
  }

  private execCliWrite(args: string[], maxBuffer = 128 * 1024 * 1024): Promise<string> {
    return this.cliPool().exec(args, 'write', { maxBuffer })
  }

  private execCliWriteSync(args: string[], maxBuffer = 128 * 1024 * 1024): string {
    return this.cliPool().execSync(args, 'write', { maxBuffer })
  }

  private execCliReadSync(args: string[], maxBuffer = 128 * 1024 * 1024): string {
    return this.cliPool().execSync(args, 'read', { maxBuffer })
  }

  private neoReader() {
    return getDuckNeoReader(this.duckDbPath)
  }

  /** 重型 duck-cli 读（初选/行业聚合）— worker 内 spawn，不阻塞主进程事件循环 */
  private execHeavyReadAsync(
    args: string[],
    maxBuffer = 128 * 1024 * 1024,
  ): Promise<string> {
    return this.execCliRead(args, maxBuffer, DUCK_READ_PRIORITY_INTERACTIVE)
  }

  private async parseHeavyReadJson(args: string[], maxBuffer = 128 * 1024 * 1024): Promise<unknown> {
    try {
      return JSON.parse(await this.execHeavyReadAsync(args, maxBuffer))
    } catch {
      return null
    }
  }

  private execWriteAsync(args: string[], maxBuffer = 128 * 1024 * 1024): Promise<string> {
    return this.schedule(() => this.execCliWrite(args, maxBuffer))
  }

  private execReadAsync(args: string[], maxBuffer = 128 * 1024 * 1024): Promise<string> {
    return this.execCliRead(args, maxBuffer, DUCK_READ_PRIORITY_INTERACTIVE)
  }

  /** @deprecated */
  private execSync(args: string[], maxBuffer = 128 * 1024 * 1024): string {
    throw new Error('execSync 已移除，请使用 execCliWrite / execWriteAsync')
  }

  /** @deprecated */
  private execAsync(args: string[], maxBuffer = 128 * 1024 * 1024): Promise<string> {
    return this.execWriteAsync(args, maxBuffer)
  }

  duckExists(): boolean {
    return fs.existsSync(this.duckDbPath)
  }

  sqliteExists(): boolean {
    return fs.existsSync(this.sqliteDbPath)
  }

  // ─── 写路径 ─────────────────────────────────────────────────────────────

  async applyBatchAsync(ops: DuckWriteOp[]): Promise<number> {
    if (!ops.length) return 0
    const tmp = path.join(os.tmpdir(), `opptrix-duck-batch-${process.pid}-${Date.now()}.json`)
    fs.writeFileSync(tmp, JSON.stringify(ops))
    try {
      const out = JSON.parse(
        await this.execCliWrite(['apply-batch', '--duckdb', this.duckDbPath, '--file', tmp]),
      ) as { applied?: number }
      invalidateHasMarketDuckDataCache(this.duckDbPath)
      return out.applied ?? 0
    } finally {
      try { fs.unlinkSync(tmp) } catch { /* ignore */ }
    }
  }

  /** 同步边界（测试 / 导出）— worker 池 + Atomics 等待，与 applyBatchAsync 同 duck-cli 路径 */
  applyBatchSync(ops: DuckWriteOp[]): number {
    if (!ops.length) return 0
    const tmp = path.join(os.tmpdir(), `opptrix-duck-batch-${process.pid}-${Date.now()}.json`)
    fs.writeFileSync(tmp, JSON.stringify(ops))
    try {
      const out = JSON.parse(
        this.execCliWriteSync(['apply-batch', '--duckdb', this.duckDbPath, '--file', tmp]),
      ) as { applied?: number }
      invalidateHasMarketDuckDataCache(this.duckDbPath)
      return out.applied ?? 0
    } finally {
      try { fs.unlinkSync(tmp) } catch { /* ignore */ }
    }
  }

  async upsertKlinesBatchAsync(rows: unknown[]): Promise<number> {
    if (!rows.length) return 0
    const tmp = path.join(os.tmpdir(), `opptrix-kline-upsert-${process.pid}-${Date.now()}.json`)
    fs.writeFileSync(tmp, JSON.stringify(rows))
    try {
      await this.execCliWrite([
        'upsert', '--duckdb', this.duckDbPath, '--sqlite', this.sqliteDbPath, '--file', tmp,
      ], 256 * 1024 * 1024)
      return rows.length
    } finally {
      try { fs.unlinkSync(tmp) } catch { /* ignore */ }
    }
  }

  upsertKlinesBatchSync(rows: unknown[]): number {
    throw new Error('upsertKlinesBatchSync 已移除，请使用 await upsertKlinesBatchAsync')
  }

  async migrateMarketDataAsync(force = false): Promise<Record<string, number>> {
    if (!this.sqliteExists()) return {}
    try {
      const args = ['migrate-market-data', '--duckdb', this.duckDbPath, '--sqlite', this.sqliteDbPath]
      if (force) args.push('--force')
      const out = JSON.parse(await this.execCliWrite(args, 512 * 1024 * 1024)) as Record<string, number>
      invalidateHasMarketDuckDataCache(this.duckDbPath)
      return out
    } catch {
      return {}
    }
  }

  migrateMarketDataSync(force = false): Record<string, number> {
    if (!this.sqliteExists()) return {}
    try {
      const args = ['migrate-market-data', '--duckdb', this.duckDbPath, '--sqlite', this.sqliteDbPath]
      if (force) args.push('--force')
      const out = JSON.parse(this.execCliWriteSync(args, 512 * 1024 * 1024)) as Record<string, number>
      invalidateHasMarketDuckDataCache(this.duckDbPath)
      return out
    } catch {
      return {}
    }
  }

  async checkMarketMigrationNeededAsync(): Promise<boolean> {
    if (!this.sqliteExists()) return false
    try {
      const out = JSON.parse(await this.execCliRead([
        'check-market-migration', '--duckdb', this.duckDbPath, '--sqlite', this.sqliteDbPath,
      ], 512 * 1024 * 1024)) as { needed?: boolean }
      return out.needed === true
    } catch {
      return true
    }
  }

  checkMarketMigrationNeededSync(): boolean {
    if (!this.sqliteExists()) return false
    try {
      const out = JSON.parse(this.execCliReadSync([
        'check-market-migration', '--duckdb', this.duckDbPath, '--sqlite', this.sqliteDbPath,
      ], 512 * 1024 * 1024)) as { needed?: boolean }
      return out.needed === true
    } catch {
      return true
    }
  }

  /** DuckDB 主存储迁移已完成 — 此后读写以 Duck 为准，不再回退 SQLite 主数据 */
  isDuckPrimaryReady(): boolean {
    if (!this.duckExists() || !this.sqliteExists()) return false
    try {
      const db = new Database(this.sqliteDbPath, { readonly: true, fileMustExist: true })
      try {
        return isDuckPrimaryMigrationComplete(db)
      } finally {
        db.close()
      }
    } catch {
      return false
    }
  }

  async syncMarketDataToSqliteAsync(): Promise<Record<string, number>> {
    if (!this.duckExists() || !this.sqliteExists()) return {}
    try {
      return JSON.parse(await this.execCliWrite([
        'sync-market-data-to-sqlite', '--duckdb', this.duckDbPath, '--sqlite', this.sqliteDbPath,
      ], 512 * 1024 * 1024)) as Record<string, number>
    } catch {
      return {}
    }
  }

  /** 同步边界（导出 .opmd）— spawnSync duck-cli，与 async 同 CLI */
  syncMarketDataToSqliteSync(): Record<string, number> {
    if (!this.duckExists() || !this.sqliteExists()) return {}
    try {
      return JSON.parse(this.execCliWriteSync([
        'sync-market-data-to-sqlite', '--duckdb', this.duckDbPath, '--sqlite', this.sqliteDbPath,
      ], 512 * 1024 * 1024)) as Record<string, number>
    } catch {
      return {}
    }
  }

  syncAnalyticsSync(_scope: AnalyticsSyncScope = 'all'): Record<string, number> {
    throw new Error('syncAnalyticsSync 已移除，请使用 await migrateMarketDataAsync')
  }

  async syncBarsToSqliteAsync(): Promise<number> {
    try {
      const out = JSON.parse(await this.execCliWrite([
        'sync-bars', '--duckdb', this.duckDbPath, '--sqlite', this.sqliteDbPath,
      ])) as { barsSynced?: number }
      return out.barsSynced ?? 0
    } catch {
      return 0
    }
  }

  syncBarsToSqliteSync(): number {
    throw new Error('syncBarsToSqliteSync 已移除，请使用 await syncBarsToSqliteAsync')
  }

  async migrateSqliteKlinesIfEmptyAsync(): Promise<number> {
    if (!this.sqliteExists()) return 0
    try {
      const lines = (await this.execCliWrite([
        'migrate-from-sqlite', '--duckdb', this.duckDbPath, '--sqlite', this.sqliteDbPath,
      ], 256 * 1024 * 1024)).split('\n').filter(Boolean)
      const last = lines[lines.length - 1]
      if (!last) return 0
      const parsed = JSON.parse(last) as { rowsImported?: number; skipped?: boolean }
      invalidateHasMarketDuckDataCache(this.duckDbPath)
      return parsed.skipped ? 0 : (parsed.rowsImported ?? 0)
    } catch {
      return 0
    }
  }

  migrateSqliteKlinesIfEmptySync(): number {
    if (!this.sqliteExists()) return 0
    try {
      const lines = this.execCliWriteSync([
        'migrate-from-sqlite', '--duckdb', this.duckDbPath, '--sqlite', this.sqliteDbPath,
      ], 256 * 1024 * 1024).split('\n').filter(Boolean)
      const last = lines[lines.length - 1]
      if (!last) return 0
      const parsed = JSON.parse(last) as { rowsImported?: number; skipped?: boolean }
      invalidateHasMarketDuckDataCache(this.duckDbPath)
      return parsed.skipped ? 0 : (parsed.rowsImported ?? 0)
    } catch {
      return 0
    }
  }

  // ─── 读路径（@duckdb/node-api 短查询 + duck-cli 重型读） ─────────────────

  /** 同步边界 — worker 池 duck-cli 读（测试 flush 后校验）；async 短读仍走 neo */
  queryAllSync<T extends Record<string, unknown>>(sql: string, params: unknown[] = []): T[] {
    if (!this.duckExists()) return []
    const tmp = path.join(os.tmpdir(), `opptrix-duck-query-${process.pid}-${Date.now()}.json`)
    fs.writeFileSync(tmp, JSON.stringify({ sql, params }))
    try {
      const raw = this.execCliReadSync(['query-json', '--duckdb', this.duckDbPath, '--file', tmp])
      return JSON.parse(raw || '[]') as T[]
    } catch {
      return []
    } finally {
      try { fs.unlinkSync(tmp) } catch { /* ignore */ }
    }
  }

  queryOneSync<T extends Record<string, unknown>>(sql: string, params: unknown[] = []): T | undefined {
    return this.queryAllSync<T>(sql, params)[0]
  }

  /** 非阻塞读 — API / Hub 优先使用 */
  queryAllAsync<T extends Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
    if (!this.duckExists()) return Promise.resolve([])
    return this.neoReader().queryAll<T>(sql, params).catch(() => [] as T[])
  }

  queryOneAsync<T extends Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T | undefined> {
    return this.queryAllAsync<T>(sql, params).then(rows => rows[0])
  }

  marketStatsSync(): MarketDuckStats {
    if (!this.duckExists()) return { ...EMPTY_MARKET_STATS }
    try {
      const raw = this.execCliReadSync(['market-stats', '--duckdb', this.duckDbPath])
      return { ...EMPTY_MARKET_STATS, ...(JSON.parse(raw || '{}') as Partial<MarketDuckStats>) }
    } catch {
      return { ...EMPTY_MARKET_STATS }
    }
  }

  marketStatsAsync(): Promise<MarketDuckStats> {
    if (!this.duckExists()) return Promise.resolve({ ...EMPTY_MARKET_STATS })
    return this.neoReader().marketStats().catch(() => ({ ...EMPTY_MARKET_STATS }))
  }

  hasMarketData(): boolean {
    if (!this.isDuckPrimaryReady()) return false
    if (!this.duckExists()) return false
    const now = Date.now()
    if (duckDataCache && duckDataCache.path === this.duckDbPath && now - duckDataCache.at < 60_000) {
      return duckDataCache.has
    }
    duckDataCache = { at: now, path: this.duckDbPath, has: true }
    return true
  }

  klineStatsSync(): KlineDuckStats {
    if (!this.duckExists()) return { rows: 0, codes: 0, maxDate: null }
    try {
      const raw = this.execCliReadSync(['stats', '--duckdb', this.duckDbPath])
      const parsed = JSON.parse(raw || '{}') as Partial<KlineDuckStats>
      return {
        rows: Number(parsed.rows ?? 0),
        codes: Number(parsed.codes ?? 0),
        maxDate: parsed.maxDate ?? null,
      }
    } catch {
      return { rows: 0, codes: 0, maxDate: null }
    }
  }

  klineStatsAsync(): Promise<KlineDuckStats> {
    if (!this.duckExists()) return Promise.resolve({ rows: 0, codes: 0, maxDate: null })
    return this.neoReader().klineStats().catch(() => ({ rows: 0, codes: 0, maxDate: null }))
  }

  queryKlinesSync(code: string, limit = 800, before?: string): StockKline[] {
    if (!this.duckExists()) return []
    const normalized = normalizeStockCode(code)
    const args = ['query-klines', '--duckdb', this.duckDbPath, '--code', normalized, '--limit', String(limit)]
    if (before) args.push('--before', before.slice(0, 10))
    try {
      const raw = this.execCliReadSync(args)
      return JSON.parse(raw || '[]') as StockKline[]
    } catch {
      return []
    }
  }

  async queryKlinesAsync(code: string, limit = 800, before?: string): Promise<StockKline[]> {
    if (!this.duckExists()) return []
    return this.neoReader().queryKlines(normalizeStockCode(code), limit, before) as unknown as Promise<StockKline[]>
  }

  codesWithMinKlinesSync(minBars: number): string[] {
    if (!this.duckExists()) return []
    return this.neoReader().codesWithMinKlinesSyncCached(minBars)
  }

  async codesWithMinKlinesAsync(minBars: number): Promise<string[]> {
    if (!this.duckExists()) return []
    return this.neoReader().codesWithMinKlines(minBars)
  }

  latestBarsSync(tradeDate?: string | null): Array<{ code: string; close: number | null; change_pct: number | null }> {
    if (!this.duckExists()) return []
    return this.neoReader().latestBarsSyncCached(tradeDate)
  }

  async latestBarsAsync(tradeDate?: string | null): Promise<Array<{ code: string; close: number | null; change_pct: number | null }>> {
    if (!this.duckExists()) return []
    return this.neoReader().latestBars(tradeDate)
  }

  analyticsStatsSync(): {
    stocks: number
    instruments: number
    taxonomy: number
    quotes: number
    factors: number
    klines: number
  } {
    if (!this.duckExists()) {
      return { stocks: 0, instruments: 0, taxonomy: 0, quotes: 0, factors: 0, klines: 0 }
    }
    return this.neoReader().analyticsStatsSyncCached()
  }

  analyticsStatsAsync(): Promise<{
    stocks: number
    instruments: number
    taxonomy: number
    quotes: number
    factors: number
    klines: number
  }> {
    if (!this.duckExists()) {
      return Promise.resolve({ stocks: 0, instruments: 0, taxonomy: 0, quotes: 0, factors: 0, klines: 0 })
    }
    return this.neoReader().analyticsStats().catch(() => ({
      stocks: 0, instruments: 0, taxonomy: 0, quotes: 0, factors: 0, klines: 0,
    }))
  }

  // ─── 独占重任务（async，不阻塞事件循环） ────────────────────────────────

  importParquetAsync(opts: {
    parquetPath: string
    mode: 'full' | 'incremental'
    onProgress?: (message: string, percent: number) => void
  }): Promise<{ rowsImported: number }> {
    const args = [
      'import',
      '--parquet', opts.parquetPath,
      '--mode', opts.mode,
      '--duckdb', this.duckDbPath,
    ]

    return this.schedule(() => new Promise((resolve, reject) => {
        let settled = false
        const finish = (fn: () => void) => {
          if (settled) return
          settled = true
          fn()
        }

        const child = spawn(process.execPath, [CLI_PATH, ...args], {
          stdio: ['ignore', 'pipe', 'pipe'],
          env: process.env,
        })

        let stderr = ''
        child.stderr?.on('data', chunk => { stderr += String(chunk) })
        child.stdout?.on('data', chunk => {
          for (const line of String(chunk).split('\n')) {
            if (!line.trim()) continue
            try {
              const msg = JSON.parse(line) as {
                type: string; message?: string; percent?: number
                rowsImported?: number; error?: string
              }
              if (msg.type === 'progress' && msg.message != null && msg.percent != null) {
                opts.onProgress?.(msg.message, msg.percent)
              } else if (msg.type === 'done') {
                invalidateHasMarketDuckDataCache(this.duckDbPath)
                finish(() => resolve({ rowsImported: msg.rowsImported ?? 0 }))
              } else if (msg.type === 'error') {
                finish(() => reject(new Error(msg.message ?? 'DuckDB 导入失败')))
              }
            } catch {
              /* ignore non-json */
            }
          }
        })

        child.on('error', err => finish(() => reject(err)))
        child.on('exit', code => {
          if (code !== 0) {
            finish(() => reject(new Error(stderr.trim() || `DuckDB 导入子进程退出码 ${code}`)))
          }
        })
    }))
  }

  /** 等待进程内 async 队列排空（测试 / 导出前） */
  async drainAsync(): Promise<void> {
    await this.asyncChain
  }
}

const gateways = new Map<string, MarketDuckGateway>()

function gatewayKey(duckDbPath: string, sqliteDbPath: string): string {
  return `${duckDbPath}\0${sqliteDbPath}`
}

export function getMarketDuckGateway(
  duckDbPath = klineDuckDbPath(),
  sqliteDbPath = marketDbPath(),
): MarketDuckGateway {
  const key = gatewayKey(duckDbPath, sqliteDbPath)
  let gw = gateways.get(key)
  if (!gw) {
    gw = new MarketDuckGateway(duckDbPath, sqliteDbPath)
    gateways.set(key, gw)
  }
  return gw
}

export function resetMarketDuckGateways(): void {
  gateways.clear()
  duckDataCache = null
  void resetDuckNeoReaders()
  // Fire-and-forget: runtime callers are sync. Tests should await resetDuckCliPools().
  void resetDuckCliPools()
}
