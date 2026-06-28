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
  jobs_completed: number
  jobs_total: number
  overall_percent: number
  message: string | null
  logs: string[]
  db_status: MarketDbStatus
}

const MAX_MEMORY_LOGS = 500

export class MarketSyncCoordinator {
  private running = false
  private memoryLogs: string[] = []
  private snapshot: Partial<SyncStateSnapshot> = {}

  constructor(
    private store: MarketDataStore,
    private createEngine: () => MarketDataSyncEngine,
  ) {}

  getSnapshot(): SyncStateSnapshot {
    const session = this.store.getLatestSession()
    const dbStatus = this.store.getStatus()
    const logs = this.running
      ? this.memoryLogs
      : this.store.getRecentLogs(session?.id ?? null, MAX_MEMORY_LOGS)

    const jobsTotal = session?.jobs_total ?? this.snapshot.jobs_total ?? ALL_SYNC_JOBS.length
    const jobsCompleted = session?.jobs_completed ?? this.snapshot.jobs_completed ?? 0
    const jobCurrent = session?.job_current ?? this.snapshot.job_current ?? 0
    const jobTotal = session?.job_total ?? this.snapshot.job_total ?? 0
    const jobFrac = jobTotal > 0 ? jobCurrent / jobTotal : 0
    const overall = jobsTotal > 0
      ? Math.min(100, ((jobsCompleted + jobFrac) / jobsTotal) * 100)
      : 0

    const sessionRunning = session?.status === 'running'

    return {
      running: this.running || sessionRunning,
      mode: (session?.mode as SyncMode | undefined) ?? null,
      session_id: session?.id ?? null,
      started_at: session?.started_at ?? null,
      finished_at: session?.finished_at ?? null,
      current_job: session?.current_job ?? this.snapshot.current_job ?? null,
      job_current: jobCurrent,
      job_total: jobTotal,
      jobs_completed: jobsCompleted,
      jobs_total: jobsTotal,
      overall_percent: Math.round(overall * 10) / 10,
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
    if (sessionId != null) this.store.appendLog(sessionId, line)
  }

  async start(options: SyncOptions = {}): Promise<{ started: boolean; running: boolean; mode: SyncMode }> {
    const mode = options.mode ?? 'incremental'
    if (this.running) {
      return { started: false, running: true, mode }
    }

    this.running = true
    this.memoryLogs = []
    const jobs = options.jobs?.length ? options.jobs : [...ALL_SYNC_JOBS]
    const sessionId = this.store.beginSession(mode, jobs.length)
    this.log(sessionId, `同步启动 · 模式 ${mode}${mode === 'incremental' ? '（按 TTL 跳过未到期数据）' : ''} · ${jobs.length} 个任务`)

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
          this.store.updateSessionProgress(sessionId, {
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
          this.store.updateSessionProgress(sessionId, {
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
          this.store.updateSessionProgress(sessionId, { jobs_completed: index + 1 })
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
