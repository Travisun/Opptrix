import type { MarketDataStore } from '../store.js'
import type { MarketDbStatus } from '../store.js'
import { MarketDataSyncEngine, ALL_SYNC_JOBS, type SyncMode, type SyncOptions } from './engine.js'

export interface SyncStateSnapshot {
  running: boolean
  mode: SyncMode | null
  session_id: number | null
  started_at: string | null
  finished_at: string | null
  current_job: string | null
  job_current: number
  job_total: number
  /** In-flight batch within the current job (resume subset). */
  job_batch_current: number | null
  job_batch_total: number | null
  jobs_completed: number
  jobs_total: number
  overall_percent: number
  message: string | null
  logs: string[]
  db_status: MarketDbStatus
}

const MAX_MEMORY_LOGS = 500

function computeOverallPercent(
  jobs: readonly string[],
  stockCount: number,
  jobProgress: MarketDbStatus['job_progress'],
): number {
  if (jobs.length === 0 || stockCount <= 0) return 0
  let sum = 0
  for (const job of jobs) {
    const done = Math.min(stockCount, jobProgress[job]?.done ?? 0)
    sum += done / stockCount
  }
  return Math.round((sum / jobs.length) * 1000) / 10
}

function countCompletedJobs(
  jobs: readonly string[],
  stockCount: number,
  jobProgress: MarketDbStatus['job_progress'],
): number {
  if (stockCount <= 0) return 0
  return jobs.filter(job => (jobProgress[job]?.done ?? 0) >= stockCount).length
}

export class MarketSyncCoordinator {
  private running = false
  private memoryLogs: string[] = []
  private snapshot: Partial<SyncStateSnapshot> = {}
  private dbStatusCache: { at: number; value: MarketDbStatus } | null = null

  private dbStatus(): MarketDbStatus {
    const now = Date.now()
    if (this.running && this.dbStatusCache && now - this.dbStatusCache.at < 2000) {
      return this.dbStatusCache.value
    }
    const value = this.store.getStatus()
    if (this.running) this.dbStatusCache = { at: now, value }
    return value
  }

  constructor(
    private store: MarketDataStore,
    private createEngine: () => MarketDataSyncEngine,
  ) {}

  getSnapshot(): SyncStateSnapshot {
    const session = this.store.getLatestSession()
    const dbStatus = this.dbStatus()
    const logs = this.running
      ? this.memoryLogs
      : this.store.getRecentLogs(session?.id ?? null, MAX_MEMORY_LOGS)

    const jobsTotal = session?.jobs_total ?? this.snapshot.jobs_total ?? ALL_SYNC_JOBS.length
    const jobsList = ALL_SYNC_JOBS.slice(0, jobsTotal)
    const stockCount = dbStatus.stock_count
    const currentJob = session?.current_job ?? this.snapshot.current_job ?? null
    const sessionRunning = this.running || session?.status === 'running'
    const rawJobCurrent = session?.job_current ?? this.snapshot.job_current ?? 0
    const rawJobTotal = session?.job_total ?? this.snapshot.job_total ?? 0
    const sessionJobsCompleted = session?.jobs_completed ?? this.snapshot.jobs_completed ?? 0

    let jobCurrent = 0
    let jobTotal = stockCount
    if (currentJob && stockCount > 0) {
      jobCurrent = Math.min(stockCount, this.store.countJobDone(currentJob))
      jobTotal = stockCount
    }

    const jobBatchCurrent = sessionRunning && rawJobTotal > 0 ? rawJobCurrent : null
    const jobBatchTotal = sessionRunning && rawJobTotal > 0 ? rawJobTotal : null

    const jobsCompleted = sessionRunning
      ? sessionJobsCompleted
      : countCompletedJobs(jobsList, stockCount, dbStatus.job_progress)

    let overall: number
    if (sessionRunning) {
      const batchFrac = rawJobTotal > 0 ? rawJobCurrent / rawJobTotal : 0
      overall = Math.min(100, Math.round(((sessionJobsCompleted + batchFrac) / jobsTotal) * 1000) / 10)
    } else {
      overall = computeOverallPercent(jobsList, stockCount, dbStatus.job_progress)
    }

    return {
      running: sessionRunning,
      mode: (session?.mode as SyncMode | undefined) ?? null,
      session_id: session?.id ?? null,
      started_at: session?.started_at ?? null,
      finished_at: session?.finished_at ?? null,
      current_job: currentJob,
      job_current: jobCurrent,
      job_total: jobTotal,
      job_batch_current: jobBatchCurrent,
      job_batch_total: jobBatchTotal,
      jobs_completed: jobsCompleted,
      jobs_total: jobsTotal,
      overall_percent: overall,
      message: session?.message ?? null,
      logs,
      db_status: dbStatus,
    }
  }

  isRunning(): boolean {
    return this.running
  }

  private log(sessionId: number | null, message: string): void {
    const line = `[${new Date().toLocaleTimeString('zh-CN', { hour12: false })}] ${message}`
    this.memoryLogs.push(line)
    if (this.memoryLogs.length > MAX_MEMORY_LOGS) this.memoryLogs.shift()
    if (sessionId != null) {
      try {
        this.store.appendLog(sessionId, line)
      } catch {
        // Keep sync alive if a progress log write fails (e.g. SQLITE_BUSY).
      }
    }
  }

  private patchProgress(sessionId: number, patch: Parameters<MarketDataStore['updateSessionProgress']>[1]): void {
    try {
      this.store.updateSessionProgress(sessionId, patch)
      this.dbStatusCache = null
    } catch {
      // Progress polling remains best-effort; sync must not abort on DB contention.
    }
  }

  async start(options: SyncOptions = {}): Promise<{ started: boolean; running: boolean; mode: SyncMode }> {
    const mode = options.mode ?? 'incremental'
    if (this.running) {
      return { started: false, running: true, mode }
    }

    this.running = true
    const jobs = options.jobs?.length ? options.jobs : [...ALL_SYNC_JOBS]
    const latest = this.store.getLatestSession()
    const reuseSession = mode === 'resume'
      && latest != null
      && (latest.status === 'interrupted' || latest.status === 'partial')

    let sessionId: number
    if (reuseSession) {
      sessionId = latest.id
      this.store.reopenSession(sessionId)
      this.memoryLogs = this.store.getRecentLogs(sessionId, MAX_MEMORY_LOGS)
      this.log(sessionId, `接续同步 · 恢复会话 #${sessionId} · ${jobs.length} 个任务`)
    } else {
      this.memoryLogs = []
      sessionId = this.store.beginSession(mode, jobs.length)
      this.log(sessionId, `同步启动 · 模式 ${mode}${mode === 'incremental' ? '（按 TTL 跳过未到期数据）' : ''} · ${jobs.length} 个任务`)
    }

    void this.runSession(sessionId, { ...options, mode, jobs }).finally(() => {
      this.running = false
    })

    return { started: true, running: true, mode }
  }

  private async runSession(sessionId: number, options: SyncOptions & { jobs: string[] }): Promise<void> {
    const engine = this.createEngine()
    try {
      const result = await engine.sync({
        ...options,
        onProgress: p => {
          this.snapshot = {
            current_job: p.job,
            job_current: p.current,
            job_total: p.total,
          }
          this.patchProgress(sessionId, {
            current_job: p.job,
            job_current: p.current,
            job_total: p.total,
          })
          if (p.message) this.log(sessionId, p.message)
          else if (p.current === p.total || p.current % 100 === 0) {
            this.log(sessionId, `${p.job}: ${p.current}/${p.total}`)
          }
        },
        onJobStart: (job, index, total) => {
          this.snapshot = {
            current_job: job,
            jobs_completed: index,
            jobs_total: total,
            job_current: 0,
            job_total: 0,
          }
          this.patchProgress(sessionId, {
            current_job: job,
            jobs_completed: index,
            jobs_total: total,
            job_current: 0,
            job_total: 0,
          })
          this.log(sessionId, `任务 ${index + 1}/${total}: ${job}`)
        },
        onJobFinish: (job, status, index) => {
          this.snapshot = {
            ...this.snapshot,
            jobs_completed: index + 1,
          }
          this.patchProgress(sessionId, { jobs_completed: index + 1 })
          this.log(sessionId, `任务 ${job} 完成 (${status})`)
        },
      })
      const failed = Object.values(result.jobs).filter(v => v.startsWith('failed')).length
      const msg = failed ? `同步结束，${failed} 个任务失败` : '同步全部完成'
      this.store.finishSession(sessionId, failed ? 'partial' : 'completed', msg)
      this.log(sessionId, msg)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      this.store.finishSession(sessionId, 'interrupted', msg)
      this.log(sessionId, `同步中断: ${msg}`)
    }
  }

  /** Resume incomplete sync after app/server restart. */
  autoResumeOnBoot(): void {
    if (this.running) return
    const stale = this.store.getLatestSession()
    if (stale?.status === 'running') {
      this.store.finishSession(stale.id, 'interrupted', '进程重启，等待接续')
    }

    const status = this.store.getStatus()
    if (status.is_ready) return

    const session = this.store.getLatestSession()
    const hasProgress = Object.values(status.job_progress).some(p => p.done > 0)
    const interrupted = session?.status === 'interrupted' || session?.status === 'partial'
    const shouldResume = interrupted || (status.stock_count > 0 && hasProgress)

    if (!shouldResume) return

    void this.start({ mode: 'resume', background: true })
  }
}

let sharedCoordinator: MarketSyncCoordinator | null = null

export function getMarketSyncCoordinator(
  store: MarketDataStore,
  createEngine: () => MarketDataSyncEngine,
): MarketSyncCoordinator {
  if (!sharedCoordinator) sharedCoordinator = new MarketSyncCoordinator(store, createEngine)
  return sharedCoordinator
}
