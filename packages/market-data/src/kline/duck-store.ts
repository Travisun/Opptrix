/**
 * @deprecated 生产路径请使用 getMarketDuckGateway() 子进程访问。
 * 本模块保留供测试 / 工具脚本直连 DuckDB（勿与 Gateway 并发写同一文件）。
 */
import fs from 'node:fs'
import path from 'node:path'
import type { StockKline } from '@opptrix/shared'
import { klineDuckDbPath } from '../paths.js'
import { normalizeStockCode } from '../utils.js'
import type { KlineUpsertRow } from '../store.js'
import {
  buildLatestBarsPageQuery,
  type LatestBarRow,
  type LatestBarsPageOpts,
} from '../duck/latest-bars-page.js'
import {
  closeDuck,
  connectDuck,
  duckAll,
  duckGet,
  duckRun,
  openDuckDatabase,
  type DuckConnection,
} from './duck-connection.js'
import { upsertCnDailyBarsBatch } from './kline-batch-upsert.js'
import type duckdb from 'duckdb'

const CN_DAILY_TABLE = 'cn_daily_bars'

const INIT_SQL = `
CREATE TABLE IF NOT EXISTS ${CN_DAILY_TABLE} (
  trade_date VARCHAR NOT NULL,
  code VARCHAR NOT NULL,
  open DOUBLE,
  high DOUBLE,
  low DOUBLE,
  close DOUBLE,
  volume DOUBLE,
  amount DOUBLE,
  change_pct DOUBLE,
  synced_at VARCHAR NOT NULL,
  PRIMARY KEY (trade_date, code)
);
`

/** DuckDB 日 K 存储 — 与 SQLite market.db 元数据协同 */
export class KlineDuckStore {
  private db: duckdb.Database
  private conn: DuckConnection
  private ready: Promise<void>

  constructor(readonly dbPath = klineDuckDbPath()) {
    const dir = path.dirname(dbPath)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    this.db = openDuckDatabase(this.dbPath, false)
    this.conn = connectDuck(this.db)
    this.ready = duckRun(this.conn, INIT_SQL)
  }

  async close(): Promise<void> {
    await this.ready.catch(() => {})
    await closeDuck(this.db)
  }

  private async q<T extends Record<string, unknown>>(sql: string, ...params: unknown[]): Promise<T[]> {
    await this.ready
    return duckAll<T>(this.conn, sql, ...params)
  }

  private async one<T extends Record<string, unknown>>(sql: string, ...params: unknown[]): Promise<T | undefined> {
    await this.ready
    return duckGet<T>(this.conn, sql, ...params)
  }

  async hasData(): Promise<boolean> {
    const row = await this.one<{ c: number }>(`SELECT COUNT(*)::INTEGER AS c FROM ${CN_DAILY_TABLE}`)
    return (row?.c ?? 0) > 0
  }

  async countRows(): Promise<number> {
    const row = await this.one<{ c: number }>(`SELECT COUNT(*)::INTEGER AS c FROM ${CN_DAILY_TABLE}`)
    return row?.c ?? 0
  }

  async countDistinctCodes(): Promise<number> {
    const row = await this.one<{ c: number }>(
      `SELECT COUNT(DISTINCT code)::INTEGER AS c FROM ${CN_DAILY_TABLE}`,
    )
    return row?.c ?? 0
  }

  async maxTradeDate(): Promise<string | null> {
    const row = await this.one<{ d: string | null }>(`SELECT MAX(trade_date) AS d FROM ${CN_DAILY_TABLE}`)
    return row?.d ?? null
  }

  async listCodesWithMinBars(minBars: number): Promise<string[]> {
    const rows = await this.q<{ code: string }>(`
      SELECT code FROM ${CN_DAILY_TABLE}
      GROUP BY code HAVING COUNT(*) >= ?
    `, minBars)
    return rows.map(r => r.code)
  }

  async queryDailyKlines(code: string, limit = 800, before?: string): Promise<StockKline[]> {
    const normalized = normalizeStockCode(code)
    const safeLimit = Math.max(1, Math.min(limit, 800))
    const params: unknown[] = [normalized]
    let beforeClause = ''
    if (before) {
      beforeClause = ' AND trade_date < ?'
      params.push(before.slice(0, 10))
    }
    params.push(safeLimit)
    const rows = await this.q<{
      trade_date: string
      open: number | null
      high: number | null
      low: number | null
      close: number | null
      volume: number | null
      amount: number | null
      change_pct: number | null
    }>(`
      SELECT trade_date, open, high, low, close, volume, amount, change_pct
      FROM ${CN_DAILY_TABLE}
      WHERE code = ?${beforeClause}
      ORDER BY trade_date DESC
      LIMIT ?
    `, ...params)

    return rows.reverse().map(row => ({
      code: normalized,
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

  /** 全量截面（兼容 / 测试）；热路径请用 latestBarSnapshotPage + stitchLatestBarsPages */
  async latestBarSnapshot(tradeDate?: string | null): Promise<Array<{ code: string; close: number | null; change_pct: number | null }>> {
    if (tradeDate) {
      return this.q(`
        SELECT code, close, change_pct
        FROM ${CN_DAILY_TABLE}
        WHERE trade_date = ?
      `, tradeDate)
    }
    return this.q(`
      SELECT k.code, k.close, k.change_pct
      FROM ${CN_DAILY_TABLE} k
      INNER JOIN (
        SELECT code, MAX(trade_date) AS trade_date FROM ${CN_DAILY_TABLE} GROUP BY code
      ) l ON k.code = l.code AND k.trade_date = l.trade_date
    `)
  }

  /** 分页截面：afterCode 游标 + limit（默认 1000，顶 2000） */
  async latestBarSnapshotPage(opts: LatestBarsPageOpts = {}): Promise<LatestBarRow[]> {
    const { sql, params } = buildLatestBarsPageQuery(CN_DAILY_TABLE, opts)
    return this.q<LatestBarRow>(sql, ...params)
  }

  async upsertBatch(rows: KlineUpsertRow[], syncedAt: string): Promise<number> {
    if (!rows.length) return 0
    await this.ready
    return upsertCnDailyBarsBatch(this.conn, CN_DAILY_TABLE, rows, syncedAt)
  }
}

let sharedKlineStore: KlineDuckStore | null = null

export function getKlineDuckStore(dbPath = klineDuckDbPath()): KlineDuckStore {
  if (!sharedKlineStore || sharedKlineStore.dbPath !== dbPath) {
    sharedKlineStore?.close().catch(() => {})
    sharedKlineStore = new KlineDuckStore(dbPath)
  }
  return sharedKlineStore
}

/** 关闭共享 KlineDuckStore（若已打开）；await 后再 exit，避免 duckdb 原生析构 SIGABRT */
export async function resetKlineDuckStore(): Promise<void> {
  const store = sharedKlineStore
  sharedKlineStore = null
  if (!store) return
  try {
    await store.close()
  } catch {
    /* ignore teardown races */
  }
}
