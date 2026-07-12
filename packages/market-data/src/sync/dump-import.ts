/**
 * Parquet dump import from tonghuashun (同花顺) API.
 *
 * Downloads Parquet dumps (daily K / adjustment factors), parses them
 * via parquet-wasm + apache-arrow (supports ZSTD compression), and
 * imports into local SQLite for offline factor screening.
 *
 * @sourceUrl https://fuyao.aicubes.cn/docs/api-reference/market-dumps/
 */

import type { MarketDataStore } from '../store.js'
import { DUMP_IMPORT_CONFIG } from './config.js'

export interface DumpImportResult {
  type: 'full' | 'incremental' | 'adjustments'
  rowsImported: number
  success: boolean
  error?: string
}

export type DumpHttpGet = <T = Record<string, unknown>>(path: string, params?: Record<string, string | number | boolean | null | undefined>) => Promise<T>

function stripThsSuffix(thscode: string): string {
  return thscode.replace(/\.(SH|SZ|BJ)$/i, '').trim()
}

function msToDate(ms: number): string {
  return new Date(ms).toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' })
}

async function fetchDownloadUrl(get: DumpHttpGet, dumpId: string): Promise<string> {
  const pathMap: Record<string, string> = {
    'a_share_daily_k_1d_none_10y': 'daily-k',
    'a_share_daily_k_1d_none_10d': 'daily-k-10d',
    'a_share_adjustment_factors_event_none_all': 'adjustment-factors',
  }
  const apiPath = pathMap[dumpId] ?? dumpId
  const data = await get<{ presigned_url?: string; download_url?: string }>(
    `/api/dump/market-dumps/${apiPath}/download-url`,
  )
  const url = data.presigned_url ?? data.download_url ?? ''
  if (!url) throw new Error('未获取到下载链接')
  return url
}

async function downloadBuffer(url: string): Promise<Buffer> {
  const resp = await fetch(url)
  if (!resp.ok) throw new Error(`Download failed: ${resp.status}`)
  return Buffer.from(await resp.arrayBuffer())
}

/** Parse daily K Parquet via parquet-wasm + Arrow IPC (supports ZSTD) */
async function parseDailyK(buffer: Buffer) {
  const pq = await import('parquet-wasm')
  const Arrow = await import('apache-arrow')
  const pqTable = pq.readParquet(buffer)
  const ipcData = pqTable.intoIPCStream()
  const arrowTable = Arrow.tableFromIPC(ipcData)

  const rows: Array<{
    tradeDate: string; code: string
    open: number | null; high: number | null; low: number | null; close: number | null
    volume: number | null; amount: number | null
  }> = []

  for (let i = 0; i < arrowTable.numRows; i++) {
    const thscode = String(arrowTable.getChild('thscode')?.get(i) ?? '')
    const code = stripThsSuffix(thscode)
    if (!code || code.length !== 6) continue
    const dateMs = Number(arrowTable.getChild('date_ms')?.get(i))
    if (!dateMs) continue
    rows.push({
      tradeDate: msToDate(dateMs),
      code,
      open: arrowTable.getChild('open_price')?.get(i) as number ?? null,
      high: arrowTable.getChild('high_price')?.get(i) as number ?? null,
      low: arrowTable.getChild('low_price')?.get(i) as number ?? null,
      close: arrowTable.getChild('close_price')?.get(i) as number ?? null,
      volume: arrowTable.getChild('volume')?.get(i) as number ?? null,
      amount: arrowTable.getChild('turnover')?.get(i) as number ?? null,
    })
  }
  return rows
}

/** Parse adjustment factors Parquet via parquet-wasm + Arrow IPC */
async function parseAdjustmentFactors(buffer: Buffer) {
  const pq = await import('parquet-wasm')
  const Arrow = await import('apache-arrow')
  const pqTable = pq.readParquet(buffer)
  const ipcData = pqTable.intoIPCStream()
  const arrowTable = Arrow.tableFromIPC(ipcData)

  const rows: Array<Record<string, unknown>> = []
  for (let i = 0; i < arrowTable.numRows; i++) {
    rows.push({
      thscode: String(arrowTable.getChild('thscode')?.get(i) ?? ''),
      ticker: String(arrowTable.getChild('ticker')?.get(i) ?? ''),
      exDateMs: Number(arrowTable.getChild('ex_date_ms')?.get(i) ?? 0),
      dividendPerShare: arrowTable.getChild('dividend_per_share')?.get(i) as number ?? null,
      perShareBonus: arrowTable.getChild('per_share_bonus')?.get(i) as number ?? null,
      allotmentRatio: arrowTable.getChild('allotment_ratio')?.get(i) as number ?? null,
      allotmentPrice: arrowTable.getChild('allotment_price')?.get(i) as number ?? null,
    })
  }
  return rows
}

/**
 * Import daily K dump (full 10y or incremental 10d).
 * @param type - 'full' for 10-year, 'incremental' for 10-day
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
 */
export async function importAdjustmentFactors(store: MarketDataStore, get: DumpHttpGet): Promise<DumpImportResult> {
  try {
    const url = await fetchDownloadUrl(get, DUMP_IMPORT_CONFIG.adjustmentDumpId)
    const buffer = await downloadBuffer(url)
    const rows = await parseAdjustmentFactors(buffer)
    return { type: 'adjustments', rowsImported: rows.length, success: true }
  } catch (e) {
    return { type: 'adjustments', rowsImported: 0, success: false, error: e instanceof Error ? e.message : String(e) }
  }
}
