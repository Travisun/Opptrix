/**
 * Parquet dump import from tonghuashun (同花顺) API.
 *
 * Downloads Parquet dumps (daily K / adjustment factors), parses them,
 * and imports into local SQLite for offline factor screening.
 *
 * @sourceUrl packages/market-data/src/sync/dump-import.ts
 */

import type { MarketDataStore } from '../store.js'
import { DUMP_IMPORT_CONFIG } from './config.js'

export interface DumpImportResult {
  type: 'full' | 'incremental' | 'adjustments'
  rowsImported: number
  success: boolean
  error?: string
}

/** HTTP GET — injected by caller to avoid cross-package import issues */
export type DumpHttpGet = <T = Record<string, unknown>>(path: string, params?: Record<string, string | number | boolean | null | undefined>) => Promise<T>

/** Strip .SH/.SZ/.BJ suffix → 6-digit code */
function stripThsSuffix(thscode: string): string {
  return thscode.replace(/\.(SH|SZ|BJ)$/i, '').trim()
}

/** Epoch ms → YYYY-MM-DD (Asia/Shanghai) */
function msToDate(ms: number): string {
  return new Date(ms).toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' })
}

/** Fetch pre-signed download URL from tonghuashun dump API */
async function fetchDownloadUrl(get: DumpHttpGet, dumpId: string): Promise<string> {
  const data = await get<{ download_url: string }>(`/dump/market-dumps/${dumpId}/download-url`)
  return data.download_url
}

/** Download file from URL to Buffer */
async function downloadBuffer(url: string): Promise<Buffer> {
  const resp = await fetch(url)
  if (!resp.ok) throw new Error(`Download failed: ${resp.status}`)
  return Buffer.from(await resp.arrayBuffer())
}

/** Parse daily K Parquet → store rows */
async function parseDailyK(buffer: Buffer) {
  // Dynamic import to avoid top-level dependency issues
  const parquet = await import('@dsnp/parquetjs')
  const reader = await parquet.ParquetReader.openBuffer(buffer)
  const cursor = reader.getCursor()
  const rows: Array<{
    tradeDate: string; code: string
    open: number | null; high: number | null; low: number | null; close: number | null
    volume: number | null; amount: number | null
  }> = []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let row: any
  while ((row = await cursor.next()) !== null) {
    const code = stripThsSuffix(row.thscode ?? '')
    if (!code || code.length !== 6) continue
    rows.push({
      tradeDate: msToDate(row.date_ms),
      code,
      open: row.open_price ?? null,
      high: row.high_price ?? null,
      low: row.low_price ?? null,
      close: row.close_price ?? null,
      volume: row.volume ?? null,
      amount: row.turnover ?? null,
    })
  }
  await reader.close()
  return rows
}

/** Parse adjustment factors Parquet */
async function parseAdjustmentFactors(buffer: Buffer) {
  const parquet = await import('@dsnp/parquetjs')
  const reader = await parquet.ParquetReader.openBuffer(buffer)
  const cursor = reader.getCursor()
  const rows: Array<Record<string, unknown>> = []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let row: any
  while ((row = await cursor.next()) !== null) {
    rows.push({
      thscode: row.thscode ?? '',
      ticker: row.ticker ?? '',
      exDateMs: row.ex_date_ms ?? 0,
      dividendPerShare: row.dividend_per_share ?? null,
      perShareBonus: row.per_share_bonus ?? null,
      allotmentRatio: row.allotment_ratio ?? null,
      allotmentPrice: row.allotment_price ?? null,
    })
  }
  await reader.close()
  return rows
}

/**
 * Import daily K dump (full 10y or incremental 10d).
 *
 * @param store - Market data store for SQLite operations
 * @param type - 'full' for 10-year, 'incremental' for 10-day
 * @param get - HTTP GET function from tonghuashun client
 *
 * @sourceUrl packages/market-data/src/sync/dump-import.ts
 */
export async function importDailyKDump(
  store: MarketDataStore,
  type: 'full' | 'incremental',
  get: DumpHttpGet,
): Promise<DumpImportResult> {
  try {
    const dumpId = type === 'full' ? DUMP_IMPORT_CONFIG.fullDumpId : DUMP_IMPORT_CONFIG.incrementalDumpId
    const url = await fetchDownloadUrl(get, dumpId)
    const buffer = await downloadBuffer(url)
    const rows = await parseDailyK(buffer)
    if (!rows.length) return { type, rowsImported: 0, success: true }
    const imported = store.bulkUpsertKlines(rows)
    return { type, rowsImported: imported, success: true }
  } catch (e) {
    return { type, rowsImported: 0, success: false, error: e instanceof Error ? e.message : String(e) }
  }
}

/**
 * Import adjustment factors dump.
 *
 * @param store - Market data store for SQLite operations
 * @param get - HTTP GET function from tonghuashun client
 *
 * @sourceUrl packages/market-data/src/sync/dump-import.ts
 */
export async function importAdjustmentFactors(store: MarketDataStore, get: DumpHttpGet): Promise<DumpImportResult> {
  try {
    const url = await fetchDownloadUrl(get, DUMP_IMPORT_CONFIG.adjustmentDumpId)
    const buffer = await downloadBuffer(url)
    const rows = await parseAdjustmentFactors(buffer)
    // TODO: store adjustment factors in SQLite when factor computation is implemented
    return { type: 'adjustments', rowsImported: rows.length, success: true }
  } catch (e) {
    return { type: 'adjustments', rowsImported: 0, success: false, error: e instanceof Error ? e.message : String(e) }
  }
}
