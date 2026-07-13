/**
 * Parquet dump import — 下载后写入临时文件，由 DuckDB 子进程导入 + 同步 SQLite bars。
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { MarketDataStore } from '../store.js'
import { DUMP_IMPORT_CONFIG } from './config.js'
import { spawnKlineParquetImport } from '../kline/spawn-import.js'

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

async function downloadToFile(
  url: string,
  timeoutMs: number,
  destPath: string,
  onProgress?: (loaded: number, total: number | null) => void,
): Promise<void> {
  const resp = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) })
  if (!resp.ok) throw new Error(`Download failed: ${resp.status}`)
  const total = resp.headers.get('content-length')
    ? Number(resp.headers.get('content-length'))
    : null
  const reader = resp.body?.getReader()
  if (!reader) {
    fs.writeFileSync(destPath, Buffer.from(await resp.arrayBuffer()))
    onProgress?.(fs.statSync(destPath).size, total)
    return
  }

  const fd = fs.openSync(destPath, 'w')
  let loaded = 0
  let lastReport = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      fs.writeSync(fd, value)
      loaded += value.length
      if (loaded - lastReport >= 512 * 1024 || (total != null && loaded >= total)) {
        onProgress?.(loaded, total)
        lastReport = loaded
      }
    }
    onProgress?.(loaded, total)
  } finally {
    fs.closeSync(fd)
  }
}

export async function importDailyKDump(
  store: MarketDataStore,
  type: 'full' | 'incremental',
  get: DumpHttpGet,
  hooks?: DumpImportHooks,
): Promise<DumpImportResult> {
  const tmpPath = path.join(os.tmpdir(), `opptrix-kline-${type}-${Date.now()}.parquet`)
  try {
    const dumpId = type === 'full' ? DUMP_IMPORT_CONFIG.fullDumpId : DUMP_IMPORT_CONFIG.incrementalDumpId
    const timeoutMs = type === 'full' ? FULL_DUMP_TIMEOUT_MS : INCR_DUMP_TIMEOUT_MS
    hooks?.onPhase?.('获取下载链接', 5)
    const url = await fetchDownloadUrl(get, dumpId)
    hooks?.onPhase?.(type === 'full' ? '下载全量包（约 170MB）' : '下载增量包', 15)
    await downloadToFile(url, timeoutMs, tmpPath, (loaded, total) => {
      if (total != null && total > 0) {
        const pct = 15 + Math.round((loaded / total) * 28)
        hooks?.onPhase?.(`下载中 ${formatMb(loaded)}/${formatMb(total)}`, pct)
      } else {
        hooks?.onPhase?.(`下载中 ${formatMb(loaded)}`, 20)
      }
    })

    hooks?.onPhase?.('DuckDB 子进程导入', 70)
    const result = await spawnKlineParquetImport({
      parquetPath: tmpPath,
      mode: type,
      duckDbPath: store.klineDuckDbPath,
      sqliteDbPath: store.dbPath,
      onProgress: (message, percent) => hooks?.onPhase?.(message, percent),
    })

    store.invalidateKlineStatsCache()
    store.syncAnalyticsToDuck('all')
    hooks?.onPhase?.('完成', 100)
    return { type, rowsImported: result.rowsImported, success: true }
  } catch (e) {
    return { type, rowsImported: 0, success: false, error: e instanceof Error ? e.message : String(e) }
  } finally {
    try { fs.unlinkSync(tmpPath) } catch { /* ignore */ }
  }
}

export async function importAdjustmentFactors(_store: MarketDataStore, get: DumpHttpGet): Promise<DumpImportResult> {
  try {
    const url = await fetchDownloadUrl(get, DUMP_IMPORT_CONFIG.adjustmentDumpId)
    const buffer = await fetch(url).then(r => r.arrayBuffer())
    void buffer
    return { type: 'adjustments', rowsImported: 0, success: true }
  } catch (e) {
    return { type: 'adjustments', rowsImported: 0, success: false, error: e instanceof Error ? e.message : String(e) }
  }
}
