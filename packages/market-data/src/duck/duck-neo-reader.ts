/**
 * @duckdb/node-api 只读短查询层 — 替代 duck-cli spawn 读路径。
 * 使用 startStreamThenReadAll 协作式多任务，不阻塞 Node 事件循环。
 */
import fs from 'node:fs'
import { DuckDBInstance, type DuckDBConnection, type DuckDBValue } from '@duckdb/node-api'
import PQueue from 'p-queue'
import { isDuckLowMemProfile, resolveDuckReadConcurrency } from './duck-cli-pool.js'
import { CN_DAILY_TABLE } from './market-schema.js'
import {
  buildLatestBarsPageQuery,
  resolveLatestBarsPageLimit,
  stitchLatestBarsPages,
  type LatestBarRow,
  type LatestBarsPageOpts,
} from './latest-bars-page.js'

export type NeoKlineDuckStats = {
  rows: number
  codes: number
  maxDate: string | null
}

export type NeoMarketDuckStats = {
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

/** Neo / Gateway `marketStats` 字段键（与 `NeoMarketDuckStats` / `MarketDuckStats` 对齐） */
export const NEO_MARKET_STATS_KEYS = [
  'stocks', 'instruments', 'taxonomy', 'quotes', 'factors', 'klines',
  'kline_codes', 'kline_codes_min60', 'profiles', 'etf',
  'cn_equity', 'hk_equity', 'us_equity',
  'announcements', 'dividends', 'partners', 'segments',
  'shareholders', 'forecasts', 'inst_holdings', 'insider_trades', 'buybacks',
] as const satisfies readonly (keyof NeoMarketDuckStats)[]

const SYNC_CACHE_MS = 5_000

const EMPTY_MARKET_STATS: NeoMarketDuckStats = {
  stocks: 0, instruments: 0, taxonomy: 0, quotes: 0, factors: 0, klines: 0,
  kline_codes: 0, kline_codes_min60: 0, profiles: 0, etf: 0,
  cn_equity: 0, hk_equity: 0, us_equity: 0,
  announcements: 0, dividends: 0, partners: 0, segments: 0,
  shareholders: 0, forecasts: 0, inst_holdings: 0, insider_trades: 0, buybacks: 0,
}

type ReaderHandle = {
  instance: DuckDBInstance
  readQueue: PQueue
  /** 与 CliPool 同源：`resolveDuckReadConcurrency()` 在 bootstrap 时锁定 */
  readConcurrency: number
  syncCache: Map<string, { at: number; value: unknown }>
}

/**
 * 单条多标量子查询 — 替代串行 COUNT；语义与历史逐表 COUNT 一致。
 * @param klineTable 日 K 表名（默认 `CN_DAILY_TABLE`）
 */
export function buildMarketStatsSql(klineTable = CN_DAILY_TABLE): string {
  return `
    SELECT
      (SELECT COUNT(*)::BIGINT FROM stocks) AS stocks,
      (SELECT COUNT(*)::BIGINT FROM instruments) AS instruments,
      (SELECT COUNT(*)::BIGINT FROM taxonomy_nodes) AS taxonomy,
      (SELECT COUNT(*)::BIGINT FROM stock_quotes_daily) AS quotes,
      (SELECT COUNT(*)::BIGINT FROM stock_factors) AS factors,
      (SELECT COUNT(*)::BIGINT FROM ${klineTable}) AS klines,
      (SELECT COUNT(DISTINCT code)::BIGINT FROM ${klineTable}) AS kline_codes,
      (SELECT COUNT(*)::BIGINT FROM (
        SELECT code FROM ${klineTable} GROUP BY code HAVING COUNT(*) >= 60
      ) t) AS kline_codes_min60,
      (SELECT COUNT(*)::BIGINT FROM stock_profiles) AS profiles,
      (SELECT COUNT(*)::BIGINT FROM etf_profiles) AS etf,
      (SELECT COUNT(*)::BIGINT FROM instruments WHERE market = 'CN' AND asset_class = 'EQUITY') AS cn_equity,
      (SELECT COUNT(*)::BIGINT FROM instruments WHERE market = 'HK' AND asset_class = 'EQUITY') AS hk_equity,
      (SELECT COUNT(*)::BIGINT FROM instruments WHERE market = 'US' AND asset_class = 'EQUITY') AS us_equity,
      (SELECT COUNT(*)::BIGINT FROM stock_announcements) AS announcements,
      (SELECT COUNT(*)::BIGINT FROM stock_dividends) AS dividends,
      (SELECT COUNT(*)::BIGINT FROM stock_partners) AS partners,
      (SELECT COUNT(*)::BIGINT FROM stock_business_segments) AS segments,
      (SELECT COUNT(*)::BIGINT FROM stock_shareholder_summary) AS shareholders,
      (SELECT COUNT(*)::BIGINT FROM stock_forecasts) AS forecasts,
      (SELECT COUNT(*)::BIGINT FROM stock_inst_holdings) AS inst_holdings,
      (SELECT COUNT(*)::BIGINT FROM stock_insider_trades) AS insider_trades,
      (SELECT COUNT(*)::BIGINT FROM stock_buybacks) AS buybacks
  `
}

function rowToMarketStats(row: Record<string, unknown> | undefined): NeoMarketDuckStats {
  const out: NeoMarketDuckStats = { ...EMPTY_MARKET_STATS }
  for (const key of NEO_MARKET_STATS_KEYS) {
    out[key] = Number(row?.[key] ?? 0)
  }
  return out
}

/** @deprecated Node 无法用 receiveMessageOnPort 驱动事件循环；同步读请用 duck-cli spawnSync */
export function runAsyncSync<T>(_promise: Promise<T>): T {
  throw new Error('runAsyncSync 不可用：请使用 MarketDuckGateway 同步路径（spawnSync duck-cli）或 async API')
}

function runQueued<T>(queue: PQueue, fn: () => Promise<T>): Promise<T> {
  return queue.add(fn) as Promise<T>
}

const readers = new Map<string, ReaderHandle>()
const bootstraps = new Map<string, Promise<ReaderHandle | null>>()

function cacheKey(sql: string, params: unknown[]): string {
  return `${sql}\0${JSON.stringify(params)}`
}

function toPositionalSql(sql: string): string {
  let i = 0
  return sql.replace(/\?/g, () => {
    i += 1
    return `$${i}`
  })
}

function positionalValues(params: unknown[]): Record<string, DuckDBValue> {
  return Object.fromEntries(params.map((p, idx) => [String(idx + 1), p as DuckDBValue]))
}

async function runReadAll<T extends Record<string, unknown>>(
  conn: DuckDBConnection,
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  const q = toPositionalSql(sql)
  const values = positionalValues(params)
  const reader = Object.keys(values).length
    ? await conn.startStreamThenReadAll(q, values)
    : await conn.startStreamThenReadAll(q)
  return reader.getRowObjectsJson() as T[]
}

async function runReadOne<T extends Record<string, unknown>>(
  conn: DuckDBConnection,
  sql: string,
  params: unknown[] = [],
): Promise<T | undefined> {
  const rows = await runReadAll<T>(conn, sql, params)
  return rows[0]
}

async function bootstrapReader(duckDbPath: string): Promise<ReaderHandle | null> {
  if (!fs.existsSync(duckDbPath)) return null
  const existing = readers.get(duckDbPath)
  if (existing) return existing

  let pending = bootstraps.get(duckDbPath)
  if (!pending) {
    pending = (async () => {
      try {
        const instance = await DuckDBInstance.fromCache(duckDbPath, {
          access_mode: 'read_only',
        })
        const readConcurrency = resolveDuckReadConcurrency()
        const handle: ReaderHandle = {
          instance,
          readConcurrency,
          readQueue: new PQueue({ concurrency: readConcurrency }),
          syncCache: new Map(),
        }
        readers.set(duckDbPath, handle)
        return handle
      } catch (err) {
        console.warn('[duck-neo-reader] 只读实例打开失败，回退 duck-cli:', err)
        return null
      } finally {
        bootstraps.delete(duckDbPath)
      }
    })()
    bootstraps.set(duckDbPath, pending)
  }
  return pending
}

async function withConnection<T>(
  duckDbPath: string,
  fn: (conn: DuckDBConnection) => Promise<T>,
): Promise<T> {
  const handle = await bootstrapReader(duckDbPath)
  if (!handle) throw new Error('DuckDB 只读实例不可用')
  const conn = await handle.instance.connect()
  try {
    return await fn(conn)
  } finally {
    conn.closeSync()
  }
}

export class DuckNeoReader {
  constructor(readonly duckDbPath: string) {}

  private async handle(): Promise<ReaderHandle | null> {
    return bootstrapReader(this.duckDbPath)
  }

  private remember<T>(_key: string, value: T): T {
    return value
  }

  private peekCached<T>(key: string, maxAgeMs = SYNC_CACHE_MS): T | undefined {
    const handle = readers.get(this.duckDbPath)
    const hit = handle?.syncCache.get(key)
    if (!hit || Date.now() - hit.at > maxAgeMs) return undefined
    return hit.value as T
  }

  /** 协作式 async 读 — Hub / API 首选 */
  async queryAll<T extends Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
    const handle = await this.handle()
    if (!handle) return []
    const key = cacheKey(sql, params)
    return runQueued(handle.readQueue, async (): Promise<T[]> => {
      const rows = await withConnection(this.duckDbPath, conn => runReadAll<T>(conn, sql, params))
      handle.syncCache.set(key, { at: Date.now(), value: rows })
      return rows
    })
  }

  async queryOne<T extends Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T | undefined> {
    const rows = await this.queryAll<T>(sql, params)
    return rows[0]
  }

  /** @deprecated 同步边界请走 MarketDuckGateway（spawnSync）；此处仅返回 TTL 缓存 */
  queryAllSyncBlocking<T extends Record<string, unknown>>(sql: string, params: unknown[] = []): T[] {
    const key = cacheKey(sql, params)
    return this.peekCached<T[]>(key) ?? []
  }

  queryOneSyncBlocking<T extends Record<string, unknown>>(sql: string, params: unknown[] = []): T | undefined {
    return this.queryAllSyncBlocking<T>(sql, params)[0]
  }

  /** @deprecated 仅预热；同步路径请用 gateway.queryAllSync */
  queryAllSyncCached<T extends Record<string, unknown>>(sql: string, params: unknown[] = []): T[] {
    const key = cacheKey(sql, params)
    const hit = this.peekCached<T[]>(key)
    if (hit) return hit
    void this.queryAll<T>(sql, params).catch(() => {})
    return []
  }

  queryOneSyncCached<T extends Record<string, unknown>>(sql: string, params: unknown[] = []): T | undefined {
    return this.queryAllSyncCached<T>(sql, params)[0]
  }

  /** @deprecated 同步统计请用 MarketDuckGateway.klineStatsSync */
  klineStatsSyncBlocking(): NeoKlineDuckStats {
    return this.peekCached<NeoKlineDuckStats>('__kline_stats__', 30_000) ?? { rows: 0, codes: 0, maxDate: null }
  }

  /** @deprecated 同步统计请用 MarketDuckGateway.marketStatsSync */
  marketStatsSyncBlocking(): NeoMarketDuckStats {
    return this.peekCached<NeoMarketDuckStats>('__market_stats__', 60_000) ?? { ...EMPTY_MARKET_STATS }
  }

  /** @deprecated 同步 K 线请用 MarketDuckGateway.queryKlinesSync */
  queryKlinesSyncBlocking(code: string, limit = 800, before?: string): Array<Record<string, unknown>> {
    const key = `__klines__:${code}:${limit}:${before ?? ''}`
    return this.peekCached<Array<Record<string, unknown>>>(key, 120_000) ?? []
  }

  queryKlinesSyncCached(code: string, limit = 800, before?: string): Array<Record<string, unknown>> {
    const key = `__klines__:${code}:${limit}:${before ?? ''}`
    const hit = this.peekCached<Array<Record<string, unknown>>>(key, 120_000)
    if (hit) return hit
    void this.queryKlines(code, limit, before).then(rows => {
      void this.handle().then(h => {
        if (h) h.syncCache.set(key, { at: Date.now(), value: rows })
      })
    })
    return []
  }

  codesWithMinKlinesSyncCached(minBars: number): string[] {
    const key = `__codes_min__:${minBars}`
    const hit = this.peekCached<string[]>(key, 120_000)
    if (hit) return hit
    void this.codesWithMinKlines(minBars).then(rows => {
      void this.handle().then(h => {
        if (h) h.syncCache.set(key, { at: Date.now(), value: rows })
      })
    })
    return []
  }

  latestBarsSyncCached(tradeDate?: string | null): Array<{ code: string; close: number | null; change_pct: number | null }> {
    const key = `__latest_bars__:${tradeDate ?? ''}`
    const hit = this.peekCached<Array<{ code: string; close: number | null; change_pct: number | null }>>(key, 60_000)
    if (hit) return hit
    // 热路径预热：分页拼回，避免一次无界全表进内存
    const limit = resolveLatestBarsPageLimit({ lowMem: isDuckLowMemProfile() })
    void stitchLatestBarsPages(
      opts => this.latestBarsPage(opts),
      { tradeDate, limit },
    ).then(rows => {
      void this.handle().then(h => {
        if (h) h.syncCache.set(key, { at: Date.now(), value: rows })
      })
    })
    return []
  }

  analyticsStatsSyncCached(): {
    stocks: number
    instruments: number
    taxonomy: number
    quotes: number
    factors: number
    klines: number
  } {
    const key = '__analytics_stats__'
    const hit = this.peekCached<{
      stocks: number
      instruments: number
      taxonomy: number
      quotes: number
      factors: number
      klines: number
    }>(key, 60_000)
    if (hit) return hit
    void this.analyticsStats().then(stats => {
      void this.handle().then(h => {
        if (h) h.syncCache.set(key, { at: Date.now(), value: stats })
      })
    })
    return { stocks: 0, instruments: 0, taxonomy: 0, quotes: 0, factors: 0, klines: 0 }
  }

  /** 启动预热 — 后台填充 K 线/市场统计缓存 */
  warmReadCaches(): void {
    void this.klineStats().catch(() => {})
    void this.marketStats().catch(() => {})
  }

  async klineStats(): Promise<NeoKlineDuckStats> {
    const key = '__kline_stats__'
    const cached = this.peekCached<NeoKlineDuckStats>(key, 30_000)
    if (cached) return cached
    const handle = await this.handle()
    if (!handle) return { rows: 0, codes: 0, maxDate: null }
    const stats = await runQueued(handle.readQueue, async (): Promise<NeoKlineDuckStats> =>
      withConnection(this.duckDbPath, async conn => {
        const row = await runReadOne<{
          rows: number
          codes: number
          maxDate: string | null
        }>(conn, `
          SELECT
            COUNT(*)::BIGINT AS rows,
            COUNT(DISTINCT code)::BIGINT AS codes,
            MAX(trade_date) AS maxDate
          FROM ${CN_DAILY_TABLE}
        `)
        return {
          rows: Number(row?.rows ?? 0),
          codes: Number(row?.codes ?? 0),
          maxDate: row?.maxDate?.slice(0, 10) ?? null,
        }
      }),
    )
    handle.syncCache.set(key, { at: Date.now(), value: stats })
    return stats
  }

  klineStatsSyncCached(): NeoKlineDuckStats {
    const hit = this.peekCached<NeoKlineDuckStats>('__kline_stats__', 30_000)
    if (hit) return hit
    void this.klineStats().catch(() => {})
    return { rows: 0, codes: 0, maxDate: null }
  }

  async marketStats(): Promise<NeoMarketDuckStats> {
    const key = '__market_stats__'
    const cached = this.peekCached<NeoMarketDuckStats>(key, 60_000)
    if (cached) return cached
    const handle = await this.handle()
    if (!handle) return { ...EMPTY_MARKET_STATS }
    const stats = await runQueued(handle.readQueue, async (): Promise<NeoMarketDuckStats> =>
      withConnection(this.duckDbPath, async conn => {
        const row = await runReadOne<Record<string, unknown>>(conn, buildMarketStatsSql())
        return rowToMarketStats(row)
      }),
    )
    handle.syncCache.set(key, { at: Date.now(), value: stats })
    return stats
  }

  marketStatsSyncCached(): NeoMarketDuckStats {
    const hit = this.peekCached<NeoMarketDuckStats>('__market_stats__', 60_000)
    if (hit) return hit
    void this.marketStats().catch(() => {})
    return { ...EMPTY_MARKET_STATS }
  }

  async analyticsStats(): Promise<{
    stocks: number
    instruments: number
    taxonomy: number
    quotes: number
    factors: number
    klines: number
  }> {
    const row = await this.queryOne<Record<string, number>>(`
      SELECT
        (SELECT COUNT(*)::BIGINT FROM dim_cn_stocks) AS stocks,
        (SELECT COUNT(*)::BIGINT FROM dim_instruments) AS instruments,
        (SELECT COUNT(*)::BIGINT FROM dim_taxonomy) AS taxonomy,
        (SELECT COUNT(*)::BIGINT FROM fact_quotes_daily) AS quotes,
        (SELECT COUNT(*)::BIGINT FROM fact_factors) AS factors,
        (SELECT COUNT(*)::BIGINT FROM ${CN_DAILY_TABLE}) AS klines
    `)
    return {
      stocks: Number(row?.stocks ?? 0),
      instruments: Number(row?.instruments ?? 0),
      taxonomy: Number(row?.taxonomy ?? 0),
      quotes: Number(row?.quotes ?? 0),
      factors: Number(row?.factors ?? 0),
      klines: Number(row?.klines ?? 0),
    }
  }

  async queryKlines(
    code: string,
    limit = 800,
    before?: string,
  ): Promise<Array<Record<string, unknown>>> {
    const params: unknown[] = [code]
    let beforeClause = ''
    if (before) {
      beforeClause = ' AND trade_date < ?'
      params.push(before.slice(0, 10))
    }
    params.push(Math.max(1, Math.min(limit, 800)))
    const rows = await this.queryAll<Record<string, unknown>>(`
      SELECT trade_date, open, high, low, close, volume, amount, change_pct
      FROM ${CN_DAILY_TABLE}
      WHERE code = ?${beforeClause}
      ORDER BY trade_date DESC
      LIMIT ?
    `, params)
    return rows.reverse().map(row => ({
      code,
      date: row.trade_date,
      open: row.open ?? 0,
      high: row.high ?? 0,
      low: row.low ?? 0,
      close: row.close ?? 0,
      volume: row.volume ?? 0,
      amount: row.amount ?? 0,
      changePct: row.change_pct ?? null,
      turnoverRate: null,
    }))
  }

  async codesWithMinKlines(minBars: number): Promise<string[]> {
    const rows = await this.queryAll<{ code: string }>(`
      SELECT code FROM ${CN_DAILY_TABLE}
      GROUP BY code HAVING COUNT(*) >= ?
    `, [minBars])
    return rows.map(r => r.code)
  }

  /** 全市场最新截面（兼容 / 测试）；热路径请用 latestBarsPage + stitchLatestBarsPages */
  async latestBars(tradeDate?: string | null): Promise<Array<{ code: string; close: number | null; change_pct: number | null }>> {
    if (tradeDate) {
      return this.queryAll(`
        SELECT code, close, change_pct FROM ${CN_DAILY_TABLE} WHERE trade_date = ?
      `, [tradeDate.slice(0, 10)])
    }
    return this.queryAll(`
      SELECT k.code, k.close, k.change_pct
      FROM ${CN_DAILY_TABLE} k
      INNER JOIN (
        SELECT code, MAX(trade_date) AS trade_date FROM ${CN_DAILY_TABLE} GROUP BY code
      ) l ON k.code = l.code AND k.trade_date = l.trade_date
    `)
  }

  /** 分页截面：afterCode 游标 + limit（默认 1000，顶 2000） */
  async latestBarsPage(opts: LatestBarsPageOpts = {}): Promise<LatestBarRow[]> {
    const { sql, params } = buildLatestBarsPageQuery(CN_DAILY_TABLE, opts)
    return this.queryAll<LatestBarRow>(sql, params)
  }
}

export function getDuckNeoReader(duckDbPath: string): DuckNeoReader {
  return new DuckNeoReader(duckDbPath)
}

/** 已 bootstrap 的 Neo 读并发（测试 / 观测）；未打开则 undefined */
export function peekDuckNeoReaderConcurrency(duckDbPath: string): number | undefined {
  return readers.get(duckDbPath)?.readConcurrency
}

export async function resetDuckNeoReaders(): Promise<void> {
  const handles = [...readers.values()]
  readers.clear()
  bootstraps.clear()
  for (const handle of handles) {
    try {
      handle.readQueue.clear()
      handle.instance.closeSync()
    } catch {
      /* ignore teardown races */
    }
  }
}
