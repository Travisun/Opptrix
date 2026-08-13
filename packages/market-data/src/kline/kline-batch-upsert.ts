/**
 * cn_daily_bars 批量 upsert — 禁止逐行 INSERT 循环。
 * 同进程默认 VALUES 直连（无临时 JSON）；可选紧凑临时文件 + 立即 unlink（Gateway/CLI）。
 * 语义：PRIMARY KEY (trade_date, code) INSERT OR REPLACE。
 */
import {
  allocScratchTempJson,
  releaseScratchTempJson,
  writeCompactTempJson,
} from '../duck/duck-temp-json.js'
import { duckRun, sqlStringLiteral, type DuckConnection } from './duck-connection.js'
import { normalizeStockCode } from '../utils.js'

export type KlineBatchUpsertRow = {
  tradeDate: string
  code: string
  open?: number | null
  high?: number | null
  low?: number | null
  close?: number | null
  volume?: number | null
  amount?: number | null
  changePct?: number | null
}

/** 临时 JSON 灌入分段上限（仅 viaTempJson） */
export const KLINE_UPSERT_SQL_CHUNK = 4_000

/** VALUES 子块：控制单语句大小，同进程零临时文件 */
export const KLINE_UPSERT_VALUES_CHUNK = 500

type NormalizedRow = {
  trade_date: string
  code: string
  open: number | null
  high: number | null
  low: number | null
  close: number | null
  volume: number | null
  amount: number | null
  change_pct: number | null
  synced_at: string
}

function toNormalizedPayload(rows: KlineBatchUpsertRow[], syncedAt: string): NormalizedRow[] {
  return rows.map(r => ({
    trade_date: r.tradeDate,
    code: normalizeStockCode(String(r.code)),
    open: r.open ?? null,
    high: r.high ?? null,
    low: r.low ?? null,
    close: r.close ?? null,
    volume: r.volume ?? null,
    amount: r.amount ?? null,
    change_pct: r.changePct ?? null,
    synced_at: syncedAt,
  }))
}

function sqlNum(v: number | null): string {
  if (v == null || !Number.isFinite(v)) return 'NULL'
  return String(v)
}

function buildValuesInsertSql(table: string, payload: NormalizedRow[]): string {
  const tuples = payload.map(r => (
    `(${sqlStringLiteral(r.trade_date)}, ${sqlStringLiteral(r.code)}, `
    + `${sqlNum(r.open)}, ${sqlNum(r.high)}, ${sqlNum(r.low)}, ${sqlNum(r.close)}, `
    + `${sqlNum(r.volume)}, ${sqlNum(r.amount)}, ${sqlNum(r.change_pct)}, `
    + `${sqlStringLiteral(r.synced_at)})`
  ))
  return `
    INSERT OR REPLACE INTO ${table}
      (trade_date, code, open, high, low, close, volume, amount, change_pct, synced_at)
    VALUES ${tuples.join(',\n')}
  `
}

async function upsertViaValues(
  conn: DuckConnection,
  table: string,
  rows: KlineBatchUpsertRow[],
  syncedAt: string,
  chunkSize: number,
): Promise<void> {
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize)
    const payload = toNormalizedPayload(chunk, syncedAt)
    await duckRun(conn, buildValuesInsertSql(table, payload))
  }
}

async function upsertViaTempJson(
  conn: DuckConnection,
  table: string,
  rows: KlineBatchUpsertRow[],
  syncedAt: string,
  chunkSize: number,
): Promise<void> {
  const scratch = allocScratchTempJson('kline-batch')
  try {
    for (let i = 0; i < rows.length; i += chunkSize) {
      const chunk = rows.slice(i, i + chunkSize)
      writeCompactTempJson(scratch, toNormalizedPayload(chunk, syncedAt))
      await duckRun(conn, `
        INSERT OR REPLACE INTO ${table}
        SELECT trade_date, code, open, high, low, close, volume, amount, change_pct, synced_at
        FROM read_json_auto(${sqlStringLiteral(scratch)})
      `)
    }
  } finally {
    releaseScratchTempJson(scratch)
  }
}

export type UpsertCnDailyBarsBatchOptions = {
  beginTransaction?: boolean
  chunkSize?: number
  /**
   * true：强制走单一 scratch JSON（Gateway/CLI 调试）；
   * 默认 false：同进程 VALUES，不写临时文件。
   */
  viaTempJson?: boolean
}

/**
 * 将 rows 批量写入 Duck 日 K 表。语义：PRIMARY KEY (trade_date, code) INSERT OR REPLACE。
 * @returns 写入行数（与输入 rows.length 一致；重复 PK 不增行）
 */
export async function upsertCnDailyBarsBatch(
  conn: DuckConnection,
  table: string,
  rows: KlineBatchUpsertRow[],
  syncedAt: string,
  options?: UpsertCnDailyBarsBatchOptions,
): Promise<number> {
  if (!rows.length) return 0
  const manageTx = options?.beginTransaction !== false
  const viaTempJson = options?.viaTempJson === true
  const chunkSize = Math.max(
    50,
    options?.chunkSize ?? (viaTempJson ? KLINE_UPSERT_SQL_CHUNK : KLINE_UPSERT_VALUES_CHUNK),
  )

  if (manageTx) await duckRun(conn, 'BEGIN TRANSACTION')
  try {
    if (viaTempJson) {
      await upsertViaTempJson(conn, table, rows, syncedAt, chunkSize)
    } else {
      await upsertViaValues(conn, table, rows, syncedAt, chunkSize)
    }
    if (manageTx) await duckRun(conn, 'COMMIT')
  } catch (e) {
    if (manageTx) await duckRun(conn, 'ROLLBACK').catch(() => {})
    throw e
  }
  return rows.length
}
