/**
 * Parquet dump import — 持久化缓存 ~/.opptrix/dumps/，7 天内复用本地文件跳过下载。
 */
import fs from 'node:fs'
import path from 'node:path'
import type { MarketDataStore } from '../store.js'
import { DUMP_IMPORT_CONFIG } from './config.js'
import { marketDataDir } from '../paths.js'
import { getMarketDuckGateway } from '../duck/market-duck-gateway.js'

export interface DumpImportResult {
  type: 'full' | 'incremental' | 'adjustments'
  rowsImported: number
  success: boolean
  error?: string
  fromCache?: boolean
}

export type DumpHttpGet = <T = Record<string, unknown>>(path: string, params?: Record<string, string | number | boolean | null | undefined>) => Promise<T>

export interface DumpImportHooks {
  onPhase?: (label: string, percent: number) => void
}

const FULL_DUMP_TIMEOUT_MS = 25 * 60 * 1000
const INCR_DUMP_TIMEOUT_MS = 5 * 60 * 1000
const MIN_PARQUET_BYTES = 4096

function parquetCacheMaxAgeMs(): number {
  return DUMP_IMPORT_CONFIG.parquetCacheMaxAgeDays * 24 * 60 * 60 * 1000
}

function formatMb(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function formatCacheAge(filePath: string): string {
  const ageMs = Date.now() - fs.statSync(filePath).mtimeMs
  const ageDays = Math.floor(ageMs / (24 * 60 * 60 * 1000))
  if (ageDays <= 0) return '今日'
  return `${ageDays} 天前`
}

function parquetCacheDir(): string {
  const dir = path.join(marketDataDir(), 'dumps')
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

export function parquetCachePath(type: 'full' | 'incremental'): string {
  const name = type === 'full' ? 'cn-daily-k-full.parquet' : 'cn-daily-k-incr.parquet'
  return path.join(parquetCacheDir(), name)
}

export function isParquetCacheFresh(
  filePath: string,
  maxAgeMs = parquetCacheMaxAgeMs(),
): boolean {
  try {
    const st = fs.statSync(filePath)
    if (st.size < MIN_PARQUET_BYTES) return false
    return Date.now() - st.mtimeMs < maxAgeMs
  } catch {
    return false
  }
}

export async function fetchDownloadUrl(get: DumpHttpGet, dumpId: string): Promise<string> {
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

export async function ensureParquetDownloaded(
  type: 'full' | 'incremental',
  get: DumpHttpGet,
  hooks?: DumpImportHooks,
  opts?: { forceRefresh?: boolean; destPath?: string },
): Promise<{ path: string; fromCache: boolean }> {
  const cachePath = opts?.destPath ?? parquetCachePath(type)
  if (!opts?.forceRefresh && isParquetCacheFresh(cachePath)) {
    const size = fs.statSync(cachePath).size
    hooks?.onPhase?.(
      `使用本地缓存（${formatMb(size)}，${formatCacheAge(cachePath)}）`,
      15,
    )
    return { path: cachePath, fromCache: true }
  }

  const dumpId = type === 'full' ? DUMP_IMPORT_CONFIG.fullDumpId : DUMP_IMPORT_CONFIG.incrementalDumpId
  const timeoutMs = type === 'full' ? FULL_DUMP_TIMEOUT_MS : INCR_DUMP_TIMEOUT_MS
  const tmpPath = `${cachePath}.tmp`
  fs.mkdirSync(path.dirname(cachePath), { recursive: true })

  try { fs.unlinkSync(tmpPath) } catch { /* ignore stale partial */ }

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

  fs.renameSync(tmpPath, cachePath)
  return { path: cachePath, fromCache: false }
}

async function importParquetFromCache(
  store: MarketDataStore,
  type: 'full' | 'incremental',
  parquetPath: string,
  hooks?: DumpImportHooks,
  fromCache = true,
): Promise<DumpImportResult> {
  store.flushDuckWritesSync({ throwOnError: true })
  hooks?.onPhase?.('DuckDB 子进程导入', fromCache ? 25 : 70)
  const result = await getMarketDuckGateway(store.klineDuckDbPath, store.dbPath).importParquetAsync({
    parquetPath,
    mode: type,
    onProgress: (message, percent) => hooks?.onPhase?.(message, percent),
  })

  store.invalidateKlineStatsCache()
  store.flushDuckWritesSync({ throwOnError: false })
  hooks?.onPhase?.('完成', 100)
  return { type, rowsImported: result.rowsImported, success: true, fromCache }
}

export async function importDailyKDump(
  store: MarketDataStore,
  type: 'full' | 'incremental',
  get: DumpHttpGet,
  hooks?: DumpImportHooks,
): Promise<DumpImportResult> {
  try {
    const { path: parquetPath, fromCache } = await ensureParquetDownloaded(type, get, hooks)
    return await importParquetFromCache(store, type, parquetPath, hooks, fromCache)
  } catch (e) {
    return {
      type,
      rowsImported: 0,
      success: false,
      error: e instanceof Error ? e.message : String(e),
    }
  }
}

/**
 * 启动时从本地 Parquet 缓存恢复中断的全量 K 线导入（无需网络）。
 */
export async function resumeKlineParquetFromCacheIfNeeded(
  store: MarketDataStore,
  hooks?: DumpImportHooks,
): Promise<DumpImportResult | null> {
  const bootstrap = store.getStatusLight().bootstrap
  if (bootstrap?.klines) return null

  const cachePath = parquetCachePath('full')
  if (!isParquetCacheFresh(cachePath)) return null

  hooks?.onPhase?.('检测到本地 K 线缓存，恢复导入…', 5)
  const result = await importParquetFromCache(store, 'full', cachePath, hooks, true)
  return result.success ? result : null
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

export type FuyaoDumpKind = 'full' | 'incremental' | 'adjustment_factors'
export type FuyaoDumpMode = 'local_path' | 'presigned_url'

const DUMP_FILE_NAMES: Record<FuyaoDumpKind, string> = {
  full: 'cn-daily-k-full.parquet',
  incremental: 'cn-daily-k-incr.parquet',
  adjustment_factors: 'cn-adjustment-factors.parquet',
}

function dumpIdForKind(kind: FuyaoDumpKind): string {
  if (kind === 'full') return DUMP_IMPORT_CONFIG.fullDumpId
  if (kind === 'incremental') return DUMP_IMPORT_CONFIG.incrementalDumpId
  return DUMP_IMPORT_CONFIG.adjustmentDumpId
}

/**
 * 为 Agent 沙盒准备扶摇 dump：服务端持 Key 取链/落盘，返回 shared 路径或短时效 URL。
 * 禁止把 API Key 注入沙盒。
 */
export async function prepareFuyaoDump(opts: {
  dumpKind: FuyaoDumpKind
  mode?: FuyaoDumpMode
  forceRefresh?: boolean
  destDir: string
  get: DumpHttpGet
  hooks?: DumpImportHooks
}): Promise<{
  ok: boolean
  path?: string
  url?: string
  url_expires_hint?: string
  bytes?: number
  from_cache?: boolean
  dump_kind: FuyaoDumpKind
  sandbox_hint: string
  error?: string
}> {
  const mode = opts.mode ?? 'local_path'
  const kind = opts.dumpKind
  const sandboxHint =
    '已在服务端完成鉴权下载；沙盒请用返回的 path（root_id=shared）或短时效 url，禁止注入 API Key。勿引导跑 market sync / dailyDump。'

  try {
    if (mode === 'presigned_url') {
      const url = await fetchDownloadUrl(opts.get, dumpIdForKind(kind))
      return {
        ok: true,
        url,
        url_expires_hint: '短时效预签名链接，尽快下载',
        dump_kind: kind,
        sandbox_hint: sandboxHint,
      }
    }

    fs.mkdirSync(opts.destDir, { recursive: true })
    const destPath = path.join(opts.destDir, DUMP_FILE_NAMES[kind])

    if (kind === 'adjustment_factors') {
      if (!opts.forceRefresh && isParquetCacheFresh(destPath)) {
        const size = fs.statSync(destPath).size
        return {
          ok: true,
          path: destPath,
          bytes: size,
          from_cache: true,
          dump_kind: kind,
          sandbox_hint: sandboxHint,
        }
      }
      opts.hooks?.onPhase?.('获取复权因子下载链接', 5)
      const url = await fetchDownloadUrl(opts.get, DUMP_IMPORT_CONFIG.adjustmentDumpId)
      const tmpPath = `${destPath}.tmp`
      try { fs.unlinkSync(tmpPath) } catch { /* ignore */ }
      opts.hooks?.onPhase?.('下载复权因子包', 20)
      await downloadToFile(url, INCR_DUMP_TIMEOUT_MS, tmpPath)
      fs.renameSync(tmpPath, destPath)
      return {
        ok: true,
        path: destPath,
        bytes: fs.statSync(destPath).size,
        from_cache: false,
        dump_kind: kind,
        sandbox_hint: sandboxHint,
      }
    }

    // 优先复用 market dumps 缓存，再拷到 shared；force 或无缓存则直接下到 shared
    const marketCache = parquetCachePath(kind)
    if (!opts.forceRefresh && isParquetCacheFresh(marketCache)) {
      fs.copyFileSync(marketCache, destPath)
      return {
        ok: true,
        path: destPath,
        bytes: fs.statSync(destPath).size,
        from_cache: true,
        dump_kind: kind,
        sandbox_hint: sandboxHint,
      }
    }

    const { path: downloaded, fromCache } = await ensureParquetDownloaded(
      kind,
      opts.get,
      opts.hooks,
      { forceRefresh: opts.forceRefresh, destPath },
    )
    return {
      ok: true,
      path: downloaded,
      bytes: fs.statSync(downloaded).size,
      from_cache: fromCache,
      dump_kind: kind,
      sandbox_hint: sandboxHint,
    }
  } catch (e) {
    return {
      ok: false,
      dump_kind: kind,
      sandbox_hint: sandboxHint,
      error: e instanceof Error ? e.message : String(e),
    }
  }
}

/** Agent / Hub 入口：内部创建 FuyaoClient，不把 Key 返回给调用方 */
export async function prepareFuyaoDumpForAgent(opts: {
  dumpKind: FuyaoDumpKind
  mode?: FuyaoDumpMode
  forceRefresh?: boolean
  destDir: string
  hooks?: DumpImportHooks
}): Promise<{
  ok: boolean
  path?: string
  url?: string
  url_expires_hint?: string
  bytes?: number
  from_cache?: boolean
  dump_kind: FuyaoDumpKind
  sandbox_hint: string
  error?: string
}> {
  const { FuyaoClient } = await import('@opptrix/a-stock-layer')
  const client = FuyaoClient.fromConfig()
  if (!client) {
    return {
      ok: false,
      dump_kind: opts.dumpKind,
      sandbox_hint: '扶摇未配置；请在设置中启用同花顺数据源。禁止向沙盒注入密钥。',
      error: '同花顺未启用或 API Key 未配置，无法准备数据包',
    }
  }
  return prepareFuyaoDump({
    ...opts,
    get: client.get.bind(client),
  })
}
