/**
 * cn_daily_bars 批量 upsert — 禁止逐行 INSERT 循环。
 * 临时 NDJSON/JSON + 单次 INSERT OR REPLACE … SELECT（PRIMARY KEY 后写覆盖）。
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
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

/** 单次 SQL 灌入上限；更大批次分多段，避免超大临时文件 / 单语句压力 */
export const KLINE_UPSERT_SQL_CHUNK = 4_000

function toNormalizedPayload(rows: KlineBatchUpsertRow[], syncedAt: string) {
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

/**
 * 将 rows 批量写入 Duck 日 K 表。语义：PRIMARY KEY (trade_date, code) INSERT OR REPLACE。
 * @returns 写入行数（与输入 rows.length 一致；重复 PK 不增行）
 */
export async function upsertCnDailyBarsBatch(
  conn: DuckConnection,
  table: string,
  rows: KlineBatchUpsertRow[],
  syncedAt: string,
  options?: { beginTransaction?: boolean; chunkSize?: number },
): Promise<number> {
  if (!rows.length) return 0
  const manageTx = options?.beginTransaction !== false
  const chunkSize = Math.max(100, options?.chunkSize ?? KLINE_UPSERT_SQL_CHUNK)

  if (manageTx) await duckRun(conn, 'BEGIN TRANSACTION')
  try {
    for (let i = 0; i < rows.length; i += chunkSize) {
      const chunk = rows.slice(i, i + chunkSize)
      const tmp = path.join(
        os.tmpdir(),
        `opptrix-kline-batch-${process.pid}-${Date.now()}-${i}.json`,
      )
      fs.writeFileSync(tmp, JSON.stringify(toNormalizedPayload(chunk, syncedAt)))
      try {
        await duckRun(conn, `
          INSERT OR REPLACE INTO ${table}
          SELECT trade_date, code, open, high, low, close, volume, amount, change_pct, synced_at
          FROM read_json_auto(${sqlStringLiteral(tmp)})
        `)
      } finally {
        try { fs.unlinkSync(tmp) } catch { /* ignore */ }
      }
    }
    if (manageTx) await duckRun(conn, 'COMMIT')
  } catch (e) {
    if (manageTx) await duckRun(conn, 'ROLLBACK').catch(() => {})
    throw e
  }
  return rows.length
}
