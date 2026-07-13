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

export interface DumpImportHooks {
  onPhase?: (label: string, percent: number) => void
}

const FULL_DUMP_TIMEOUT_MS = 25 * 60 * 1000
const INCR_DUMP_TIMEOUT_MS = 5 * 60 * 1000

function formatMb(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

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

async function downloadBuffer(
  url: string,
  timeoutMs: number,
  onProgress?: (loaded: number, total: number | null) => void,
): Promise<Buffer> {
  const resp = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) })
  if (!resp.ok) throw new Error(`Download failed: ${resp.status}`)
  const total = resp.headers.get('content-length')
    ? Number(resp.headers.get('content-length'))
    : null
  const reader = resp.body?.getReader()
  if (!reader) return Buffer.from(await resp.arrayBuffer())

  const chunks: Buffer[] = []
  let loaded = 0
  let lastReport = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    const chunk = Buffer.from(value)
    chunks.push(chunk)
    loaded += chunk.length
    if (loaded - lastReport >= 512 * 1024 || (total != null && loaded >= total)) {
      onProgress?.(loaded, total)
      lastReport = loaded
    }
  }
  onProgress?.(loaded, total)
  return Buffer.concat(chunks)
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
  hooks?: DumpImportHooks,
): Promise<DumpImportResult> {
  try {
    const dumpId = type === 'full' ? DUMP_IMPORT_CONFIG.fullDumpId : DUMP_IMPORT_CONFIG.incrementalDumpId
    const timeoutMs = type === 'full' ? FULL_DUMP_TIMEOUT_MS : INCR_DUMP_TIMEOUT_MS
    hooks?.onPhase?.('获取下载链接', 5)
    const url = await fetchDownloadUrl(get, dumpId)
    hooks?.onPhase?.(type === 'full' ? '下载全量包（约 170MB，需数分钟）' : '下载增量包', 15)
    const buffer = await downloadBuffer(url, timeoutMs, (loaded, total) => {
      if (total != null && total > 0) {
        const frac = loaded / total
        const pct = 15 + Math.round(frac * 28)
        hooks?.onPhase?.(`下载中 ${formatMb(loaded)}/${formatMb(total)}`, pct)
      } else {
        hooks?.onPhase?.(`下载中 ${formatMb(loaded)}`, 20)
      }
    })
    hooks?.onPhase?.('解析 Parquet', 45)
    const rows = await parseDailyK(buffer)
    if (!rows.length) return { type, rowsImported: 0, success: true }
    hooks?.onPhase?.(`写入 SQLite（${rows.length.toLocaleString()} 条）`, 70)
    const imported = store.bulkUpsertKlines(rows, (done, total) => {
      const pct = 70 + Math.round((done / total) * 28)
      hooks?.onPhase?.(`写入中 ${done.toLocaleString()}/${total.toLocaleString()} 条`, Math.min(99, pct))
    })
    hooks?.onPhase?.('完成', 100)
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
    const buffer = await downloadBuffer(url, 5 * 60 * 1000)
    const rows = await parseAdjustmentFactors(buffer)
    return { type: 'adjustments', rowsImported: rows.length, success: true }
  } catch (e) {
    return { type: 'adjustments', rowsImported: 0, success: false, error: e instanceof Error ? e.message : String(e) }
  }
}
