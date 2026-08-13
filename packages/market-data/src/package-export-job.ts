/**
 * 市场数据包导出 — 后台 job，避免单次 HTTP 同步阻塞数分钟。
 * POST start → poll status → ready 后短超时下载临时文件。
 */
import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import type { SupplementPackId } from '@opptrix/shared'
import { isSupplementPackId } from '@opptrix/shared'
import { marketDataDir } from './paths.js'
import { suggestPackageFilename, PACKAGE_MIME } from './package.js'
import { suggestPackFilename } from './package-pack.js'

export type PackageExportJobState = 'queued' | 'running' | 'ready' | 'failed'

export interface PackageExportJobSnapshot {
  job_id: string
  status: PackageExportJobState
  pack: SupplementPackId | null
  percent: number
  message: string
  error: string | null
  filename: string | null
  bytes: number | null
  download_path: string | null
  created_at: string
  updated_at: string
}

const JOB_TTL_MS = 60 * 60 * 1000
const MAX_JOBS = 8

const jobs = new Map<string, PackageExportJobSnapshot & { filePath?: string }>()
const running = new Set<string>()
/** 后台导出 Promise — 测试须 await settle，避免 duck-cli / worker 残留成 unhandledRejection */
const runningTasks = new Map<string, Promise<void>>()

type PackageExportRunner = (pack: SupplementPackId | null) => Promise<Buffer>
let testExportRunner: PackageExportRunner | null = null

/** 测试注入导出实现，跳过真实 MarketDataService / duck-cli */
export function setPackageExportRunnerForTests(runner: PackageExportRunner | null): void {
  testExportRunner = runner
}

/** 等待所有后台导出任务结束（成功或失败） */
export async function awaitPackageExportJobsForTests(): Promise<void> {
  await Promise.allSettled([...runningTasks.values()])
}

function exportTmpDir(): string {
  const dir = path.join(marketDataDir(), 'tmp', 'package-exports')
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

function nowIso(): string {
  return new Date().toISOString()
}

function pruneJobs(): void {
  const cutoff = Date.now() - JOB_TTL_MS
  for (const [id, job] of jobs) {
    if (running.has(id)) continue
    const updated = Date.parse(job.updated_at)
    if (!Number.isFinite(updated) || updated < cutoff) {
      if (job.filePath) {
        try { fs.unlinkSync(job.filePath) } catch { /* ignore */ }
      }
      jobs.delete(id)
    }
  }
  while (jobs.size > MAX_JOBS) {
    const oldest = [...jobs.entries()]
      .filter(([id]) => !running.has(id))
      .sort((a, b) => Date.parse(a[1].updated_at) - Date.parse(b[1].updated_at))[0]
    if (!oldest) break
    const [id, job] = oldest
    if (job.filePath) {
      try { fs.unlinkSync(job.filePath) } catch { /* ignore */ }
    }
    jobs.delete(id)
  }
}

function patch(id: string, patch: Partial<PackageExportJobSnapshot> & { filePath?: string }): PackageExportJobSnapshot {
  const prev = jobs.get(id)
  if (!prev) throw new Error(`导出任务不存在：${id}`)
  const next = {
    ...prev,
    ...patch,
    updated_at: nowIso(),
  }
  jobs.set(id, next)
  const { filePath: _fp, ...publicSnap } = next
  void _fp
  return {
    job_id: publicSnap.job_id,
    status: publicSnap.status,
    pack: publicSnap.pack,
    percent: publicSnap.percent,
    message: publicSnap.message,
    error: publicSnap.error,
    filename: publicSnap.filename,
    bytes: publicSnap.bytes,
    download_path: publicSnap.status === 'ready' ? `/api/market-data/export/jobs/${id}/download` : null,
    created_at: publicSnap.created_at,
    updated_at: publicSnap.updated_at,
  }
}

function toPublic(job: PackageExportJobSnapshot & { filePath?: string }): PackageExportJobSnapshot {
  return {
    job_id: job.job_id,
    status: job.status,
    pack: job.pack,
    percent: job.percent,
    message: job.message,
    error: job.error,
    filename: job.filename,
    bytes: job.bytes,
    download_path: job.status === 'ready' ? `/api/market-data/export/jobs/${job.job_id}/download` : null,
    created_at: job.created_at,
    updated_at: job.updated_at,
  }
}

export function getPackageExportJob(jobId: string): PackageExportJobSnapshot | null {
  pruneJobs()
  const job = jobs.get(jobId)
  return job ? toPublic(job) : null
}

export function getPackageExportJobFilePath(jobId: string): { filePath: string; filename: string; bytes: number } | null {
  const job = jobs.get(jobId)
  if (!job || job.status !== 'ready' || !job.filePath || !job.filename) return null
  if (!fs.existsSync(job.filePath)) return null
  return {
    filePath: job.filePath,
    filename: job.filename,
    bytes: job.bytes ?? fs.statSync(job.filePath).size,
  }
}

export function startPackageExportJob(opts?: { pack?: string | null }): PackageExportJobSnapshot {
  pruneJobs()
  let pack: SupplementPackId | null = null
  if (opts?.pack) {
    const raw = String(opts.pack).trim()
    if (!isSupplementPackId(raw)) {
      throw new Error(`无效的市场包：${raw}`)
    }
    pack = raw
  }

  const jobId = randomUUID()
  const created = nowIso()
  const snap: PackageExportJobSnapshot & { filePath?: string } = {
    job_id: jobId,
    status: 'queued',
    pack,
    percent: 0,
    message: '已加入导出队列',
    error: null,
    filename: null,
    bytes: null,
    download_path: null,
    created_at: created,
    updated_at: created,
  }
  jobs.set(jobId, snap)
  running.add(jobId)

  const task = (async () => {
    try {
      patch(jobId, { status: 'running', percent: 10, message: '正在打包本地市场数据…' })
      const buffer = testExportRunner
        ? await testExportRunner(pack)
        : await (async () => {
            // 动态 import 避免与 index 循环依赖
            const { getMarketDataService } = await import('./index.js')
            return getMarketDataService().exportPackage(pack ?? undefined)
          })()
      const filename = pack
        ? suggestPackFilename(pack)
        : suggestPackageFilename()
      const filePath = path.join(exportTmpDir(), `${jobId}${path.extname(filename) || '.opmd'}`)
      fs.writeFileSync(filePath, buffer)
      patch(jobId, {
        status: 'ready',
        percent: 100,
        message: '导出完成，可以下载',
        filename,
        bytes: buffer.length,
        error: null,
        filePath,
      })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      patch(jobId, {
        status: 'failed',
        percent: 0,
        message: msg,
        error: msg,
      })
    } finally {
      running.delete(jobId)
      runningTasks.delete(jobId)
    }
  })()
  runningTasks.set(jobId, task)
  // 显式吞掉，避免测试结束前无人 await 时变 unhandledRejection（状态已写入 job）
  void task.catch(() => {})

  return toPublic(snap)
}

export function resetPackageExportJobsForTests(): void {
  testExportRunner = null
  for (const [id, job] of jobs) {
    if (job.filePath) {
      try { fs.unlinkSync(job.filePath) } catch { /* ignore */ }
    }
    jobs.delete(id)
  }
  running.clear()
  runningTasks.clear()
}

export { PACKAGE_MIME }
