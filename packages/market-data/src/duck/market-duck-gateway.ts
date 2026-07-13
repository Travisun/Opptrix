/**
 * Market DuckDB 统一访问层 — 单写者多读者、文件锁串行化、async 优先。
 *
 * 所有 market.duckdb 读写必须经此 Gateway（禁止散落 execFileSync / 直连 duck-cli）。
 * SQLite market.db 仍为 sync 控制面，由 MarketDataStore 管理。
 */
import { execFileSync, spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { StockKline } from '@opptrix/shared'
import { klineDuckDbPath, marketDbPath } from '../paths.js'
import { normalizeStockCode } from '../utils.js'
import type { DuckWriteOp } from './market-writes.js'
import { withDuckFileLockAsync, withDuckFileLockSync } from './duck-subprocess-gate.js'
import type { LocalUniverseScreenQuery } from '../query/screen.js'

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

  private execSync(args: string[], maxBuffer = 128 * 1024 * 1024): string {
    return withDuckFileLockSync(this.duckDbPath, () =>
      execFileSync(process.execPath, [CLI_PATH, ...args], {
        encoding: 'utf8',
        maxBuffer,
        env: process.env,
      }).trim(),
    )
  }

  private execAsync(args: string[], maxBuffer = 128 * 1024 * 1024): Promise<string> {
    return this.schedule(() =>
      withDuckFileLockAsync(this.duckDbPath, () => new Promise((resolve, reject) => {
        const child = spawn(process.execPath, [CLI_PATH, ...args], {
          stdio: ['ignore', 'pipe', 'pipe'],
          env: process.env,
        })
        let stdout = ''
        let stderr = ''
        child.stdout?.on('data', chunk => { stdout += String(chunk) })
        child.stderr?.on('data', chunk => { stderr += String(chunk) })
        child.on('error', reject)
        child.on('exit', code => {
          if (code !== 0) {
            reject(new Error(stderr.trim() || `duck-cli exit ${code}`))
            return
          }
          if (stdout.length > maxBuffer) {
            reject(new Error('duck-cli stdout exceeded maxBuffer'))
            return
          }
          resolve(stdout.trim())
        })
      }), 600_000),
    )
  }

  duckExists(): boolean {
    return fs.existsSync(this.duckDbPath)
  }

  sqliteExists(): boolean {
    return fs.existsSync(this.sqliteDbPath)
  }

  // ─── 写路径 ─────────────────────────────────────────────────────────────

  applyBatchSync(ops: DuckWriteOp[]): number {
    if (!ops.length) return 0
    const tmp = path.join(os.tmpdir(), `opptrix-duck-batch-${process.pid}-${Date.now()}.json`)
    fs.writeFileSync(tmp, JSON.stringify(ops))
    try {
      const out = JSON.parse(
        this.execSync(['apply-batch', '--duckdb', this.duckDbPath, '--file', tmp]),
      ) as { applied?: number }
      invalidateHasMarketDuckDataCache(this.duckDbPath)
      return out.applied ?? 0
    } finally {
      try { fs.unlinkSync(tmp) } catch { /* ignore */ }
    }
  }

  upsertKlinesBatchSync(rows: unknown[]): number {
    if (!rows.length) return 0
    const tmp = path.join(os.tmpdir(), `opptrix-kline-upsert-${process.pid}-${Date.now()}.json`)
    fs.writeFileSync(tmp, JSON.stringify(rows))
    try {
      this.execSync([
        'upsert', '--duckdb', this.duckDbPath, '--sqlite', this.sqliteDbPath, '--file', tmp,
      ], 256 * 1024 * 1024)
      return rows.length
    } finally {
      try { fs.unlinkSync(tmp) } catch { /* ignore */ }
    }
  }

  migrateMarketDataSync(force = false): Record<string, number> {
    if (!this.sqliteExists()) return {}
    try {
      const args = ['migrate-market-data', '--duckdb', this.duckDbPath, '--sqlite', this.sqliteDbPath]
      if (force) args.push('--force')
      const out = JSON.parse(this.execSync(args, 512 * 1024 * 1024)) as Record<string, number>
      invalidateHasMarketDuckDataCache(this.duckDbPath)
      return out
    } catch {
      return {}
    }
  }

  syncMarketDataToSqliteSync(): Record<string, number> {
    if (!this.duckExists() || !this.sqliteExists()) return {}
    try {
      return JSON.parse(this.execSync([
        'sync-market-data-to-sqlite', '--duckdb', this.duckDbPath, '--sqlite', this.sqliteDbPath,
      ], 512 * 1024 * 1024)) as Record<string, number>
    } catch {
      return {}
    }
  }

  syncAnalyticsSync(_scope: AnalyticsSyncScope = 'all'): Record<string, number> {
    return this.migrateMarketDataSync(false)
  }

  syncBarsToSqliteSync(): number {
    try {
      const out = JSON.parse(this.execSync([
        'sync-bars', '--duckdb', this.duckDbPath, '--sqlite', this.sqliteDbPath,
      ])) as { barsSynced?: number }
      return out.barsSynced ?? 0
    } catch {
      return 0
    }
  }

  migrateSqliteKlinesIfEmptySync(): number {
    if (!this.sqliteExists()) return 0
    try {
      const lines = this.execSync([
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

  // ─── 读路径（sync — 同步任务 / 批量写入边界） ───────────────────────────

  queryAllSync<T extends Record<string, unknown>>(sql: string, params: unknown[] = []): T[] {
    if (!this.duckExists()) return []
    const tmp = path.join(os.tmpdir(), `opptrix-duck-q-${process.pid}-${Date.now()}.json`)
    fs.writeFileSync(tmp, JSON.stringify({ sql, params }))
    try {
      return JSON.parse(
        this.execSync(['query-json', '--duckdb', this.duckDbPath, '--file', tmp]),
      ) as T[]
    } catch {
      return []
    } finally {
      try { fs.unlinkSync(tmp) } catch { /* ignore */ }
    }
  }

  queryOneSync<T extends Record<string, unknown>>(sql: string, params: unknown[] = []): T | undefined {
    return this.queryAllSync<T>(sql, params)[0]
  }

  /** 非阻塞读 — API / Hub 轮询优先使用 */
  queryAllAsync<T extends Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
    if (!this.duckExists()) return Promise.resolve([])
    const tmp = path.join(os.tmpdir(), `opptrix-duck-q-${process.pid}-${Date.now()}.json`)
    fs.writeFileSync(tmp, JSON.stringify({ sql, params }))
    return this.execAsync(['query-json', '--duckdb', this.duckDbPath, '--file', tmp])
      .then(out => JSON.parse(out) as T[])
      .catch(() => [] as T[])
      .finally(() => {
        try { fs.unlinkSync(tmp) } catch { /* ignore */ }
      })
  }

  marketStatsSync(): MarketDuckStats {
    if (!this.duckExists()) return { ...EMPTY_MARKET_STATS }
    try {
      return JSON.parse(this.execSync(['market-stats', '--duckdb', this.duckDbPath])) as MarketDuckStats
    } catch {
      return { ...EMPTY_MARKET_STATS }
    }
  }

  marketStatsAsync(): Promise<MarketDuckStats> {
    if (!this.duckExists()) return Promise.resolve({ ...EMPTY_MARKET_STATS })
    return this.execAsync(['market-stats', '--duckdb', this.duckDbPath])
      .then(out => JSON.parse(out) as MarketDuckStats)
      .catch(() => ({ ...EMPTY_MARKET_STATS }))
  }

  hasMarketData(): boolean {
    const now = Date.now()
    if (duckDataCache && duckDataCache.path === this.duckDbPath && now - duckDataCache.at < 15_000) {
      return duckDataCache.has
    }
    const stats = this.marketStatsSync()
    const has = stats.stocks > 0 || stats.instruments > 0 || stats.klines > 0
    duckDataCache = { at: now, path: this.duckDbPath, has }
    return has
  }

  klineStatsSync(): KlineDuckStats {
    if (!this.duckExists()) return { rows: 0, codes: 0, maxDate: null }
    try {
      return JSON.parse(this.execSync(['stats', '--duckdb', this.duckDbPath])) as KlineDuckStats
    } catch {
      return { rows: 0, codes: 0, maxDate: null }
    }
  }

  queryKlinesSync(code: string, limit = 800, before?: string): StockKline[] {
    if (!this.duckExists()) return []
    const args = [
      'query-klines', '--duckdb', this.duckDbPath,
      '--code', normalizeStockCode(code), '--limit', String(limit),
    ]
    if (before) args.push('--before', before.slice(0, 10))
    try {
      return JSON.parse(this.execSync(args)) as StockKline[]
    } catch {
      return []
    }
  }

  codesWithMinKlinesSync(minBars: number): string[] {
    if (!this.duckExists()) return []
    try {
      return JSON.parse(this.execSync([
        'codes-with-min', '--duckdb', this.duckDbPath, '--min', String(minBars),
      ])) as string[]
    } catch {
      return []
    }
  }

  latestBarsSync(tradeDate?: string | null): Array<{ code: string; close: number | null; change_pct: number | null }> {
    if (!this.duckExists()) return []
    const args = ['latest-bars', '--duckdb', this.duckDbPath]
    if (tradeDate) args.push('--date', tradeDate.slice(0, 10))
    try {
      return JSON.parse(this.execSync(args)) as Array<{
        code: string; close: number | null; change_pct: number | null
      }>
    } catch {
      return []
    }
  }

  analyticsStatsSync(): {
    stocks: number; instruments: number; taxonomy: number
    quotes: number; factors: number; klines: number
  } {
    if (!this.duckExists()) {
      return { stocks: 0, instruments: 0, taxonomy: 0, quotes: 0, factors: 0, klines: 0 }
    }
    try {
      return JSON.parse(this.execSync(['analytics-stats', '--duckdb', this.duckDbPath])) as ReturnType<
        MarketDuckGateway['analyticsStatsSync']
      >
    } catch {
      return { stocks: 0, instruments: 0, taxonomy: 0, quotes: 0, factors: 0, klines: 0 }
    }
  }

  computeFactorsSync(tradeDate: string, codes?: string[]): { computed: number; written: number } {
    if (!this.duckExists()) return { computed: 0, written: 0 }
    const args = [
      'compute-factors', '--duckdb', this.duckDbPath, '--sqlite', this.sqliteDbPath, '--date', tradeDate,
    ]
    let tmp: string | undefined
    if (codes?.length) {
      tmp = path.join(os.tmpdir(), `opptrix-factor-codes-${process.pid}-${Date.now()}.json`)
      fs.writeFileSync(tmp, JSON.stringify(codes))
      args.push('--file', tmp)
    }
    try {
      return JSON.parse(this.execSync(args)) as { computed: number; written: number }
    } catch {
      return { computed: 0, written: 0 }
    } finally {
      if (tmp) try { fs.unlinkSync(tmp) } catch { /* ignore */ }
    }
  }

  queryIndustryStatsSync(tradeDate: string): unknown {
    if (!this.hasMarketData()) return null
    try {
      return JSON.parse(this.execSync([
        'query-industry-stats', '--duckdb', this.duckDbPath, '--date', tradeDate,
      ]))
    } catch {
      return null
    }
  }

  queryIndustryStocksSync(industry: string, tradeDate: string, limit: number): unknown {
    if (!this.hasMarketData()) return null
    try {
      return JSON.parse(this.execSync([
        'query-industry-stocks', '--duckdb', this.duckDbPath,
        '--industry', industry, '--date', tradeDate, '--limit', String(limit),
      ]))
    } catch {
      return null
    }
  }

  queryUniverseScreenSync(query: LocalUniverseScreenQuery, tradeDate: string): unknown {
    if (!this.hasMarketData()) return null
    const tmp = path.join(os.tmpdir(), `opptrix-screen-${process.pid}-${Date.now()}.json`)
    fs.writeFileSync(tmp, JSON.stringify({ ...query, trade_date: tradeDate }))
    try {
      return JSON.parse(this.execSync([
        'screen-universe', '--duckdb', this.duckDbPath, '--file', tmp,
      ], 128 * 1024 * 1024))
    } catch {
      return null
    } finally {
      try { fs.unlinkSync(tmp) } catch { /* ignore */ }
    }
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

    return this.schedule(() =>
      withDuckFileLockAsync(this.duckDbPath, () => new Promise((resolve, reject) => {
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
      }), 600_000),
    )
  }

  spawnComputeFactorsAsync(opts: {
    tradeDate: string
    codes?: string[]
    onProgress?: (message: string, percent: number) => void
  }): Promise<{ computed: number; written: number }> {
    if (!this.duckExists()) return Promise.resolve({ computed: 0, written: 0 })

    const args = [
      'compute-factors', '--duckdb', this.duckDbPath, '--sqlite', this.sqliteDbPath, '--date', opts.tradeDate,
    ]
    let codesFile: string | undefined
    if (opts.codes?.length) {
      codesFile = path.join(os.tmpdir(), `opptrix-factor-codes-${process.pid}-${Date.now()}.json`)
      fs.writeFileSync(codesFile, JSON.stringify(opts.codes))
      args.push('--file', codesFile)
    }

    opts.onProgress?.('启动因子计算子进程…', 5)

    return this.schedule(() =>
      withDuckFileLockAsync(this.duckDbPath, () => new Promise((resolve, reject) => {
        let settled = false
        const finish = (fn: () => void) => {
          if (settled) return
          settled = true
          if (codesFile) {
            try { fs.unlinkSync(codesFile) } catch { /* ignore */ }
          }
          fn()
        }

        const child = spawn(process.execPath, [CLI_PATH, ...args], {
          stdio: ['ignore', 'pipe', 'pipe'],
          env: process.env,
        })

        let stdout = ''
        let stderr = ''
        child.stdout?.on('data', chunk => { stdout += String(chunk) })
        child.stderr?.on('data', chunk => { stderr += String(chunk) })
        opts.onProgress?.('批量计算筛选因子…', 40)

        child.on('error', err => finish(() => reject(err)))
        child.on('exit', code => {
          if (code !== 0) {
            finish(() => reject(new Error(stderr.trim() || `因子计算子进程退出码 ${code}`)))
            return
          }
          try {
            const result = JSON.parse(stdout.trim()) as { computed: number; written: number }
            opts.onProgress?.('因子计算完成', 100)
            finish(() => resolve(result))
          } catch {
            finish(() => reject(new Error('因子计算子进程输出解析失败')))
          }
        })
      }), 600_000),
    )
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
}
