/**
 * 扶摇 dump 准备 job — local_path 冷下载后台执行，避免 Agent tool 同步卡 5–25 分钟。
 * 缓存命中 / presigned_url 仍走同步快速路径。
 */
import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import {
  prepareFuyaoDump,
  isParquetCacheFresh,
  parquetCachePath,
  type DumpHttpGet,
  type DumpImportHooks,
  type FuyaoDumpKind,
  type FuyaoDumpMode,
} from './dump-import.js'

export type FuyaoDumpJobState = 'preparing' | 'ready' | 'failed'

export interface FuyaoDumpJobResult {
  ok: boolean
  status: FuyaoDumpJobState
  job_id?: string
  poll_hint?: string
  path?: string
  url?: string
  url_expires_hint?: string
  bytes?: number
  from_cache?: boolean
  dump_kind: FuyaoDumpKind
  sandbox_hint: string
  error?: string
  percent?: number
  message?: string
}

interface JobRecord {
  id: string
  status: FuyaoDumpJobState
  dumpKind: FuyaoDumpKind
  mode: FuyaoDumpMode
  destDir: string
  percent: number
  message: string
  result?: Awaited<ReturnType<typeof prepareFuyaoDump>>
  error?: string
  updatedAt: number
}

const JOB_TTL_MS = 2 * 60 * 60 * 1000
const jobs = new Map<string, JobRecord>()
const runningByKey = new Map<string, string>()

const DUMP_FILE_NAMES: Record<FuyaoDumpKind, string> = {
  full: 'cn-daily-k-full.parquet',
  incremental: 'cn-daily-k-incr.parquet',
  adjustment_factors: 'cn-adjustment-factors.parquet',
}

const SANDBOX_HINT =
  '已在服务端完成鉴权下载；沙盒请用返回的 path（root_id=shared）或短时效 url，禁止注入 API Key。图表与诊断请用在线行情，勿引导跑 market sync / 主库日 K 导入。'

function jobKey(kind: FuyaoDumpKind, destDir: string, forceRefresh: boolean): string {
  return `${kind}|${path.resolve(destDir)}|force=${forceRefresh ? 1 : 0}`
}

function pruneJobs(): void {
  const cutoff = Date.now() - JOB_TTL_MS
  for (const [id, job] of jobs) {
    if (job.status === 'preparing') continue
    if (job.updatedAt < cutoff) jobs.delete(id)
  }
}

export function isFuyaoDumpLocalCacheReady(
  dumpKind: FuyaoDumpKind,
  destDir: string,
  forceRefresh?: boolean,
): boolean {
  if (forceRefresh) return false
  if (dumpKind === 'adjustment_factors') {
    return isParquetCacheFresh(path.join(destDir, DUMP_FILE_NAMES[dumpKind]))
  }
  return isParquetCacheFresh(parquetCachePath(dumpKind))
}

function recordToResult(job: JobRecord): FuyaoDumpJobResult {
  if (job.status === 'preparing') {
    return {
      ok: true,
      status: 'preparing',
      job_id: job.id,
      dump_kind: job.dumpKind,
      sandbox_hint: SANDBOX_HINT,
      percent: job.percent,
      message: job.message,
      poll_hint:
        '冷下载进行中。请再次调用 prepare_fuyao_dump({ job_id }) 轮询；就绪后返回 path/url。勿重复 force_refresh 另起任务。',
    }
  }
  if (job.status === 'failed' || !job.result?.ok) {
    return {
      ok: false,
      status: 'failed',
      job_id: job.id,
      dump_kind: job.dumpKind,
      sandbox_hint: job.result?.sandbox_hint ?? SANDBOX_HINT,
      error: job.error ?? job.result?.error ?? '准备失败',
      percent: job.percent,
      message: job.message,
    }
  }
  return {
    ok: true,
    status: 'ready',
    job_id: job.id,
    path: job.result.path,
    url: job.result.url,
    url_expires_hint: job.result.url_expires_hint,
    bytes: job.result.bytes,
    from_cache: job.result.from_cache,
    dump_kind: job.dumpKind,
    sandbox_hint: job.result.sandbox_hint,
    percent: 100,
    message: '已就绪',
  }
}

export function getFuyaoDumpJob(jobId: string): FuyaoDumpJobResult | null {
  pruneJobs()
  const job = jobs.get(jobId)
  return job ? recordToResult(job) : null
}

function startBackgroundJob(opts: {
  dumpKind: FuyaoDumpKind
  mode: FuyaoDumpMode
  forceRefresh?: boolean
  destDir: string
  get: DumpHttpGet
  hooks?: DumpImportHooks
}): FuyaoDumpJobResult {
  pruneJobs()
  const key = jobKey(opts.dumpKind, opts.destDir, Boolean(opts.forceRefresh))
  const existingId = runningByKey.get(key)
  if (existingId) {
    const existing = jobs.get(existingId)
    if (existing && existing.status === 'preparing') {
      return recordToResult(existing)
    }
  }

  const id = randomUUID()
  const record: JobRecord = {
    id,
    status: 'preparing',
    dumpKind: opts.dumpKind,
    mode: opts.mode,
    destDir: opts.destDir,
    percent: 5,
    message: '正在后台准备离线数据包…',
    updatedAt: Date.now(),
  }
  jobs.set(id, record)
  runningByKey.set(key, id)

  void (async () => {
    try {
      fs.mkdirSync(opts.destDir, { recursive: true })
      const result = await prepareFuyaoDump({
        dumpKind: opts.dumpKind,
        mode: opts.mode,
        forceRefresh: opts.forceRefresh,
        destDir: opts.destDir,
        get: opts.get,
        hooks: {
          onPhase: (label, percent) => {
            record.percent = Math.min(99, Math.max(5, percent))
            record.message = label
            record.updatedAt = Date.now()
            opts.hooks?.onPhase?.(label, percent)
          },
        },
      })
      record.result = result
      record.status = result.ok ? 'ready' : 'failed'
      record.error = result.error
      record.percent = result.ok ? 100 : record.percent
      record.message = result.ok ? '已就绪' : (result.error ?? '准备失败')
      record.updatedAt = Date.now()
    } catch (e) {
      record.status = 'failed'
      record.error = e instanceof Error ? e.message : String(e)
      record.message = record.error
      record.updatedAt = Date.now()
    } finally {
      if (runningByKey.get(key) === id) runningByKey.delete(key)
    }
  })()

  return recordToResult(record)
}

/**
 * Agent 入口：presigned_url / 缓存命中同步返回 ready；冷下载立即 preparing + job_id。
 */
export async function prepareFuyaoDumpMaybeAsync(opts: {
  dumpKind: FuyaoDumpKind
  mode?: FuyaoDumpMode
  forceRefresh?: boolean
  destDir: string
  get: DumpHttpGet
  hooks?: DumpImportHooks
  jobId?: string
}): Promise<FuyaoDumpJobResult> {
  if (opts.jobId) {
    const polled = getFuyaoDumpJob(opts.jobId)
    if (!polled) {
      return {
        ok: false,
        status: 'failed',
        dump_kind: opts.dumpKind,
        sandbox_hint: SANDBOX_HINT,
        error: `找不到任务 ${opts.jobId}，请重新调用 prepare_fuyao_dump 启动`,
      }
    }
    return polled
  }

  const mode = opts.mode ?? 'local_path'

  if (mode === 'presigned_url') {
    const result = await prepareFuyaoDump({ ...opts, mode })
    return {
      ...result,
      status: result.ok ? 'ready' : 'failed',
    }
  }

  if (isFuyaoDumpLocalCacheReady(opts.dumpKind, opts.destDir, opts.forceRefresh)) {
    const result = await prepareFuyaoDump({ ...opts, mode })
    return {
      ...result,
      status: result.ok ? 'ready' : 'failed',
    }
  }

  return startBackgroundJob({
    dumpKind: opts.dumpKind,
    mode,
    forceRefresh: opts.forceRefresh,
    destDir: opts.destDir,
    get: opts.get,
    hooks: opts.hooks,
  })
}

export async function prepareFuyaoDumpForAgentAsync(opts: {
  dumpKind: FuyaoDumpKind
  mode?: FuyaoDumpMode
  forceRefresh?: boolean
  destDir: string
  hooks?: DumpImportHooks
  jobId?: string
}): Promise<FuyaoDumpJobResult> {
  if (opts.jobId) {
    const polled = getFuyaoDumpJob(opts.jobId)
    if (!polled) {
      return {
        ok: false,
        status: 'failed',
        dump_kind: opts.dumpKind,
        sandbox_hint: SANDBOX_HINT,
        error: `找不到任务 ${opts.jobId}，请重新调用 prepare_fuyao_dump 启动`,
      }
    }
    return polled
  }

  const { FuyaoClient } = await import('@opptrix/a-stock-layer')
  const client = FuyaoClient.fromConfig()
  if (!client) {
    return {
      ok: false,
      status: 'failed',
      dump_kind: opts.dumpKind,
      sandbox_hint: '扶摇未配置；请在设置中启用同花顺数据源。禁止向沙盒注入密钥。',
      error: '同花顺未启用或 API Key 未配置，无法准备数据包',
    }
  }
  return prepareFuyaoDumpMaybeAsync({
    ...opts,
    get: client.get.bind(client),
  })
}

export function resetFuyaoDumpJobsForTests(): void {
  jobs.clear()
  runningByKey.clear()
}
