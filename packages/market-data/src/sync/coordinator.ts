import { markMarketPackPrepared } from '../market-pack-settings.js'
import type { MarketDbStatus, MarketDataStore } from '../store.js'
import { jobsForMarketPack } from './market-packs.js'
import { ALL_SYNC_JOBS, BOOTSTRAP_SYNC_JOBS, CN_MANUAL_SYNC_JOBS, type MarketDataSyncEngine, type SyncMode, type SyncOptions, type SyncProgress } from './engine.js'
import { THS_KLINE_DUMP_JOBS } from './config.js'
import { resolveAutoBootPlan } from './plan.js'
import { resumeKlineParquetFromCacheIfNeeded } from './dump-import.js'
import { getMarketDerivedMaintenanceCoordinator } from './derived-coordinator.js'
import { setMarketSyncActive, isMarketSyncActive, isDerivedMaintenanceActive } from '../duck/duck-subprocess-gate.js'
import {
  computeBootstrapOverallPercent,
  countBootstrapCompletedJobs,
  isBootstrapJobList,
} from './progress.js'

export interface SyncFailedJob {
  job: string
  error: string
}

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
  failed_jobs: SyncFailedJob[]
  db_status: MarketDbStatus
}

const MAX_MEMORY_LOGS = 500
const DB_STATUS_CACHE_MS_IDLE = 10_000
const DB_STATUS_CACHE_MS_RUNNING = 12_000
const DB_STATUS_CACHE_MS_HEAVY_IMPORT = 18_000

/** 名录/行业等 bootstrap 任务 — 运行中用内存进度覆盖 DB 聚合（避免 DuckDB 写入滞后） */
const BOOTSTRAP_PROGRESS_JOBS = new Set([
  'initial_cn_universe',
  'initial_hk_universe',
  'initial_us_universe',
  'initial_cn_etf',
  'initial_taxonomy',
])

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
  private lastStaleReconcileAt = 0
  private static readonly RECONCILE_INTERVAL_MS = 60_000
  private memoryLogs: string[] = []
  private snapshot: Partial<SyncStateSnapshot> & { message?: string | null } = {}
  private dbStatusCache: { at: number; value: MarketDbStatus } | null = null
  private bootstrapProgressRepaired = false
  private lastJobResults: Record<string, string> = {}
  private lastJobResultsSessionId: number | null = null
  private incompleteBootstrapRetryTimer: ReturnType<typeof setTimeout> | null = null
  private incompleteBootstrapRetryAttempts = 0
  private static readonly INCOMPLETE_BOOTSTRAP_RETRY_MS = 45_000
  private static readonly INCOMPLETE_BOOTSTRAP_RETRY_MAX = 12

  private dbStatus(): MarketDbStatus {
    const now = Date.now()
    const currentJob = this.snapshot.current_job ?? null
    const heavyImport = this.running
      && currentJob != null
      && THS_KLINE_DUMP_JOBS.has(currentJob)

    if (this.running) {
      const cacheMs = heavyImport ? DB_STATUS_CACHE_MS_HEAVY_IMPORT : DB_STATUS_CACHE_MS_RUNNING
      if (this.dbStatusCache && now - this.dbStatusCache.at < cacheMs) {
        let value = this.dbStatusCache.value
        if (heavyImport) value = this.overlayThsKlineProgress(value)
        else if (currentJob && BOOTSTRAP_PROGRESS_JOBS.has(currentJob)) {
          value = this.overlayBootstrapJobProgress(value)
        }
        return value
      }
      const value = this.dbStatusCache
        ? this.store.getStatusLite(this.dbStatusCache.value)
        : this.store.getStatusLight()
      this.dbStatusCache = { at: now, value }
      if (heavyImport) return this.overlayThsKlineProgress(value)
      if (currentJob && BOOTSTRAP_PROGRESS_JOBS.has(currentJob)) {
        return this.overlayBootstrapJobProgress(value)
      }
      return value
    }

    if (this.dbStatusCache && now - this.dbStatusCache.at < DB_STATUS_CACHE_MS_IDLE) {
      return this.dbStatusCache.value
    }
    const value = this.store.getStatusLight()
    this.dbStatusCache = { at: now, value }
    return value
  }

  /** Overlay in-memory universe/taxonomy progress (avoids stale DuckDB counts during sync). */
  private overlayBootstrapJobProgress(status: MarketDbStatus): MarketDbStatus {
    const job = this.snapshot.current_job
    if (!job || !BOOTSTRAP_PROGRESS_JOBS.has(job)) return status
    const current = this.snapshot.job_current ?? 0
    const total = this.snapshot.job_total ?? 0
    if (total <= 0) return status
    return {
      ...status,
      job_progress: {
        ...status.job_progress,
        [job]: {
          done: current,
          pending: Math.max(0, total - current),
          error: status.job_progress[job]?.error ?? 0,
        },
      },
    }
  }

  /** Overlay in-memory dump import percent onto kline job progress (avoids COUNT DISTINCT during import). */
  private overlayThsKlineProgress(status: MarketDbStatus): MarketDbStatus {
    const job = this.snapshot.current_job
    if (!job || !THS_KLINE_DUMP_JOBS.has(job)) return status
    const current = this.snapshot.job_current ?? 0
    const total = this.snapshot.job_total ?? 100
    const stockCount = status.stock_count
    const frac = total > 0 ? current / total : 0
    const done = Math.min(stockCount, Math.round(frac * stockCount))
    return {
      ...status,
      job_progress: {
        ...status.job_progress,
        [job]: {
          done,
          pending: Math.max(0, stockCount - done),
          error: status.job_progress[job]?.error ?? 0,
        },
      },
    }
  }

  /** Shared read path for Hub / API — avoids duplicate heavy getStatus() calls. */
  getCachedDbStatus(): MarketDbStatus {
    return this.dbStatus()
  }

  invalidateDbStatusCache(): void {
    this.dbStatusCache = null
    this.store.invalidateStatusLightCache()
  }

  constructor(
    private store: MarketDataStore,
    private createEngine: () => MarketDataSyncEngine,
  ) {}

  getSnapshot(): SyncStateSnapshot {
    const now = Date.now()
    if (now - this.lastStaleReconcileAt >= MarketSyncCoordinator.RECONCILE_INTERVAL_MS) {
      this.lastStaleReconcileAt = now
      setImmediate(() => {
        try {
          this.store.reconcileStaleSyncState()
        } catch { /* best-effort */ }
      })
    }
    if (!this.bootstrapProgressRepaired) {
      this.bootstrapProgressRepaired = true
      setImmediate(() => {
        if (this.running || isMarketSyncActive()) return
        try {
          this.store.repairBootstrapJobProgress()
        } catch { /* best-effort */ }
      })
    }
    let session = this.store.getLatestSession()
    if (!this.running && session?.status === 'running') {
      this.store.finishSession(session.id, 'interrupted', '同步已中断（无活动进程）')
      this.dbStatusCache = null
      session = this.store.getLatestSession()
    }
    const dbStatus = this.dbStatus()
    const logs = this.logsForSnapshot(session)

    const jobsTotal = session?.jobs_total ?? this.snapshot.jobs_total ?? BOOTSTRAP_SYNC_JOBS.length
    const jobsList = jobsTotal >= ALL_SYNC_JOBS.length
      ? [...ALL_SYNC_JOBS]
      : jobsTotal === CN_MANUAL_SYNC_JOBS.length
        ? [...CN_MANUAL_SYNC_JOBS]
        : [...BOOTSTRAP_SYNC_JOBS]
    const stockCount = dbStatus.stock_count
    const currentJob = this.running
      ? (this.snapshot.current_job ?? session?.current_job ?? null)
      : (session?.current_job ?? this.snapshot.current_job ?? null)
    const sessionRunning = this.running || session?.status === 'running'
    const rawJobCurrent = this.running
      ? (this.snapshot.job_current ?? session?.job_current ?? 0)
      : (session?.job_current ?? this.snapshot.job_current ?? 0)
    const rawJobTotal = this.running
      ? (this.snapshot.job_total ?? session?.job_total ?? 0)
      : (session?.job_total ?? this.snapshot.job_total ?? 0)
    const sessionJobsCompleted = this.running
      ? (this.snapshot.jobs_completed ?? session?.jobs_completed ?? 0)
      : (session?.jobs_completed ?? this.snapshot.jobs_completed ?? 0)
    const sessionMessage = this.running
      ? (this.snapshot.message ?? session?.message ?? null)
      : (session?.message ?? this.snapshot.message ?? null)

    const isThsKlineJob = currentJob != null && THS_KLINE_DUMP_JOBS.has(currentJob)

    let jobCurrent = 0
    let jobTotal = stockCount
    if (isThsKlineJob && sessionRunning) {
      jobCurrent = rawJobCurrent
      jobTotal = rawJobTotal > 0 ? rawJobTotal : 100
    } else if (currentJob && stockCount > 0) {
      if (this.running) {
        jobCurrent = Math.min(stockCount, this.snapshot.job_current ?? 0)
      } else {
        jobCurrent = Math.min(stockCount, this.store.countJobDone(currentJob))
      }
      jobTotal = stockCount
    }

    const jobBatchCurrent = sessionRunning && rawJobTotal > 0 ? rawJobCurrent : null
    const jobBatchTotal = sessionRunning && rawJobTotal > 0 ? rawJobTotal : null

    const jobsCompleted = sessionRunning
      ? sessionJobsCompleted
      : (isBootstrapJobList(jobsList)
        ? countBootstrapCompletedJobs(jobsList, dbStatus)
        : countCompletedJobs(jobsList, stockCount, dbStatus.job_progress))

    let overall: number
    if (sessionRunning) {
      const batchFrac = rawJobTotal > 0 ? rawJobCurrent / rawJobTotal : 0
      overall = Math.min(100, Math.round(((sessionJobsCompleted + batchFrac) / jobsTotal) * 1000) / 10)
    } else if (isBootstrapJobList(jobsList)) {
      overall = computeBootstrapOverallPercent(jobsList, dbStatus)
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
      message: sessionMessage,
      logs,
      failed_jobs: this.resolveFailedJobs(session),
      db_status: dbStatus,
    }
  }

  private failedJobsFromResults(
    results: Record<string, string>,
  ): SyncFailedJob[] {
    return Object.entries(results)
      .filter(([, v]) => String(v).startsWith('failed'))
      .map(([job, v]) => ({
        job,
        error: String(v).replace(/^failed:\s*/, '') || '未知错误',
      }))
  }

  private resolveFailedJobs(
    session: ReturnType<MarketDataStore['getLatestSession']>,
  ): SyncFailedJob[] {
    if (session?.id != null && this.lastJobResultsSessionId === session.id) {
      return this.failedJobsFromResults(this.lastJobResults)
    }
    if (session?.id != null && (session.status === 'partial' || session.status === 'interrupted')) {
      return this.store.getFailedRunsForSession(session.id)
    }
    return []
  }

  isRunning(): boolean {
    return this.running
  }

  /** 运行中读内存；结束后优先 DB，DB 空则回退内存（appendLog 失败时仍可见） */
  private logsForSnapshot(
    session: ReturnType<MarketDataStore['getLatestSession']>,
  ): string[] {
    const sessionId = session?.id ?? null
    if (this.running) return [...this.memoryLogs]
    if (sessionId != null && this.lastJobResultsSessionId === sessionId && this.memoryLogs.length) {
      return [...this.memoryLogs]
    }
    const dbLogs = this.store.getRecentLogs(sessionId, MAX_MEMORY_LOGS)
    return dbLogs.length ? dbLogs : [...this.memoryLogs]
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
    if (isDerivedMaintenanceActive()) {
      return { started: false, running: false, mode }
    }

    this.store.reconcileStaleSyncState()
    const staleRunning = this.store.getLatestSession()
    if (staleRunning?.status === 'running') {
      this.store.finishSession(staleRunning.id, 'interrupted', '上次同步未正常结束，已重置')
    }

    this.running = true
    setMarketSyncActive(true)
    const jobs = options.jobs?.length ? options.jobs : [...BOOTSTRAP_SYNC_JOBS]
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
      this.lastJobResults = {}
      this.lastJobResultsSessionId = null
      sessionId = this.store.beginSession(mode, jobs.length)
      this.log(sessionId, `同步启动 · 模式 ${mode}${mode === 'incremental' ? '（按 TTL 跳过未到期数据）' : ''} · ${jobs.length} 个任务`)
    }

    void this.runSession(sessionId, { ...options, mode, jobs }).finally(() => {
      this.running = false
      setMarketSyncActive(false)
      this.dbStatusCache = null
    })

    return { started: true, running: true, mode }
  }

  private async runSession(sessionId: number, options: SyncOptions & { jobs: string[] }): Promise<void> {
    const engine = this.createEngine()
    try {
      const result = await engine.sync({
        ...options,
        onLog: (message: string) => this.log(sessionId, message),
        onProgress: (p: SyncProgress) => {
          this.snapshot = {
            current_job: p.job,
            job_current: p.current,
            job_total: p.total,
            message: p.message ?? this.snapshot.message ?? null,
          }
          this.patchProgress(sessionId, {
            current_job: p.job,
            job_current: p.current,
            job_total: p.total,
            message: p.message ?? undefined,
          })
          if (p.message) {
            const prev = this.snapshot.message
            const phaseChanged = !prev || !p.message.startsWith(prev.split(' ')[0] ?? '')
            if (phaseChanged || p.current % 5 === 0 || p.current >= p.total) {
              this.log(sessionId, p.message)
            }
          } else if (p.current === p.total || p.current % 10 === 0) {
            this.log(sessionId, `${p.job}: ${p.current}/${p.total}`)
          }
        },
        onJobStart: (job: string, index: number, total: number) => {
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
        onJobFinish: (job: string, status: string, index: number) => {
          this.snapshot = {
            ...this.snapshot,
            jobs_completed: index + 1,
          }
          this.patchProgress(sessionId, { jobs_completed: index + 1 })
          this.store.invalidateDuckMarketStatsCache()
          this.invalidateDbStatusCache()
          if (String(status).startsWith('failed')) {
            const err = String(status).replace(/^failed:\s*/, '')
            this.log(sessionId, `✗ 任务失败 · ${job}: ${err}`)
          } else if (String(status) === 'skipped') {
            this.log(sessionId, `○ 任务跳过 · ${job}`)
          } else {
            this.log(sessionId, `✓ 任务完成 · ${job} (${status})`)
          }
        },
      })
      const failed = Object.values(result.jobs).filter(v => String(v).startsWith('failed')).length
      const bootstrap = this.store.getStatusLight().bootstrap
      const overall = computeBootstrapOverallPercent(
        options.jobs,
        this.store.getStatusLight(),
      )
      this.lastJobResults = result.jobs
      this.lastJobResultsSessionId = sessionId
      const pack = options.marketPack
      if (pack) {
        const packJobs = [...jobsForMarketPack(pack)]
        const packFailed = packJobs.some(j => String(result.jobs[j] ?? '').startsWith('failed'))
        if (!packFailed) markMarketPackPrepared(pack)
      }
      let msg: string
      if (failed > 0) {
        const details = this.failedJobsFromResults(result.jobs)
          .map(f => `${f.job}: ${f.error}`)
          .join('；')
        msg = `同步结束，${failed} 个任务失败 — ${details}`
        for (const f of this.failedJobsFromResults(result.jobs)) {
          this.log(sessionId, `失败详情 · ${f.job}: ${f.error}`)
        }
      } else if (bootstrap?.ready) {
        msg = '初选包已就绪，可开始本地挖掘'
      } else {
        msg = `同步结束，初选包构建中（${overall}%）`
      }
      this.store.finishSession(sessionId, failed ? 'partial' : (bootstrap?.ready ? 'completed' : 'partial'), msg)
      this.log(sessionId, msg)
      if (bootstrap?.ready) {
        this.incompleteBootstrapRetryAttempts = 0
      } else if (failed === 0 && bootstrap) {
        this.scheduleIncompleteBootstrapRetry(sessionId, bootstrap)
      }
      this.triggerDerivedMaintenance()
      this.store.maybeSyncAnalyticsToDuckBackground()
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      this.store.finishSession(sessionId, 'interrupted', msg)
      this.log(sessionId, `同步中断: ${msg}`)
      if (e instanceof Error && e.stack) {
        this.log(sessionId, e.stack)
      }
    }
  }

  /** 本地基础数据同步已停用 — boot 不再触发 bootstrap / derived maintenance */
  autoSyncOnBoot(): void {
    /* no-op */
  }

  /** 初选包未就绪时短间隔续跑，避免同步结束后长时间无后台动作 */
  private scheduleIncompleteBootstrapRetry(
    sessionId: number,
    bootstrap: ReturnType<MarketDataStore['assessBootstrapReadiness']>,
  ): void {
    if (this.incompleteBootstrapRetryAttempts >= MarketSyncCoordinator.INCOMPLETE_BOOTSTRAP_RETRY_MAX) {
      this.log(sessionId, '初选包仍未就绪，请稍后在设置中手动触发同步，或等待定时刷新')
      return
    }
    if (this.incompleteBootstrapRetryTimer != null) clearTimeout(this.incompleteBootstrapRetryTimer)
    this.incompleteBootstrapRetryAttempts += 1
    const waitSec = Math.round(MarketSyncCoordinator.INCOMPLETE_BOOTSTRAP_RETRY_MS / 1000)
    const hint = !bootstrap.klines
      ? '历史 K 线 Parquet 包未完成'
      : '名录/行业等待补全'
    this.log(sessionId, `初选包构建中（${hint}），${waitSec} 秒后继续后台补全…`)
    this.incompleteBootstrapRetryTimer = setTimeout(() => {
      this.incompleteBootstrapRetryTimer = null
      if (this.running) return
      this.autoSyncOnBoot()
    }, MarketSyncCoordinator.INCOMPLETE_BOOTSTRAP_RETRY_MS)
    if (typeof this.incompleteBootstrapRetryTimer === 'object' && 'unref' in this.incompleteBootstrapRetryTimer) {
      this.incompleteBootstrapRetryTimer.unref()
    }
  }

  private async runAutoSyncOnBoot(): Promise<void> {
    if (this.running || isDerivedMaintenanceActive()) return
    this.store.reconcileStaleSyncState()
    const stale = this.store.getLatestSession()
    if (stale?.status === 'running') {
      this.store.finishSession(stale.id, 'interrupted', '进程重启，等待接续')
    }

    this.store.invalidateStatusLightCache()

    const status = this.store.getStatusForBootPlan()
    const session = this.store.getLatestSession()
    const plan = resolveAutoBootPlan(status, session)
    if (plan) {
      await this.start({
        mode: plan.mode,
        jobs: [...plan.jobs],
        background: true,
      })
    }
    this.triggerDerivedMaintenance()

    setImmediate(() => {
      if (this.running || isDerivedMaintenanceActive()) return
      try {
        this.store.repairKlineImportArtifacts()
      } catch { /* background repair */ }
      void resumeKlineParquetFromCacheIfNeeded(this.store).then(result => {
        if (result?.success && !this.running && !isDerivedMaintenanceActive()) {
          void this.autoSyncOnBoot()
        }
      }).catch(() => { /* 缓存恢复失败时由后续同步计划重试 */ })
    })
  }

  private triggerDerivedMaintenance(): void {
    getMarketDerivedMaintenanceCoordinator(this.store, () => this.running).autoMaintainOnBoot()
  }

  /** 本地刷新调度已停用 */
  startRefreshScheduler(): void {
    /* no-op */
  }

  /** @deprecated Use autoSyncOnBoot */
  autoResumeOnBoot(): void {
    this.autoSyncOnBoot()
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

export function resetSharedMarketSyncCoordinator(): void {
  sharedCoordinator = null
}
