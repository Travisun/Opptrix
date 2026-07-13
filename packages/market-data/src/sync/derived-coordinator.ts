import type { MarketDataStore, MarketDbStatus, DerivedReadiness } from '../store.js'
import {
  getMarketDuckGateway,
  type DerivedMaintenanceCliEvent,
} from '../duck/market-duck-gateway.js'
import {
  isMarketSyncActive,
  isDerivedMaintenanceActive,
  setDerivedMaintenanceActive,
} from '../duck/duck-subprocess-gate.js'
import { CN_DERIVED_MAINTENANCE_JOBS } from './config.js'
import {
  computeDerivedOverallPercent,
  resolveDerivedMaintenancePlan,
  resolveDerivedMaintenanceManualPlan,
  shouldAutoDerivedMaintenanceOnBoot,
  type DerivedMaintenancePlan,
} from './derived-plan.js'
import { applyDerivedMaintenanceResult } from './derived-runner.js'

export interface DerivedMaintenanceSnapshot {
  running: boolean
  current_job: string | null
  job_current: number
  job_total: number
  jobs_completed: number
  jobs_total: number
  overall_percent: number
  message: string | null
  logs: string[]
}

const MAX_MEMORY_LOGS = 200
const RETRY_MS = 60_000
const RETRY_MAX = 10

export class MarketDerivedMaintenanceCoordinator {
  private running = false
  private memoryLogs: string[] = []
  private snapshot: Partial<DerivedMaintenanceSnapshot> = {}
  private retryTimer: ReturnType<typeof setTimeout> | null = null
  private retryAttempts = 0
  private refreshTimer: ReturnType<typeof setInterval> | null = null

  constructor(
    private store: MarketDataStore,
    private isSyncRunning: () => boolean,
  ) {}

  setSyncRunningCheck(fn: () => boolean): void {
    this.isSyncRunning = fn
  }

  isRunning(): boolean {
    return this.running
  }

  getSnapshot(dbStatus?: MarketDbStatus): DerivedMaintenanceSnapshot {
    const derived = dbStatus?.derived ?? this.store.getStatusLight().derived
    const overall = this.running
      ? (this.snapshot.overall_percent ?? 0)
      : computeDerivedOverallPercent(derived)

    return {
      running: this.running,
      current_job: this.running ? (this.snapshot.current_job ?? null) : null,
      job_current: this.running ? (this.snapshot.job_current ?? 0) : 0,
      job_total: this.running ? (this.snapshot.job_total ?? 100) : 100,
      jobs_completed: this.running ? (this.snapshot.jobs_completed ?? 0) : 0,
      jobs_total: CN_DERIVED_MAINTENANCE_JOBS.length,
      overall_percent: overall,
      message: this.running ? (this.snapshot.message ?? null) : null,
      logs: [...this.memoryLogs],
    }
  }

  autoMaintainOnBoot(): void {
    if (this.running || this.isSyncRunning() || isMarketSyncActive() || isDerivedMaintenanceActive()) return
    setImmediate(() => void this.runAutoMaintain())
  }

  /** 手动启动本地指标维护（默认全量重算 screen_factors + industry_stats） */
  start(options: { force?: boolean } = {}): {
    started: boolean
    running: boolean
    message?: string
  } {
    const force = options.force !== false
    if (this.running) {
      return { started: false, running: true, message: '本地指标维护已在运行' }
    }
    if (this.isSyncRunning() || isMarketSyncActive() || isDerivedMaintenanceActive()) {
      return { started: false, running: false, message: '外部数据同步进行中，请稍后再试' }
    }
    const status = this.store.getStatusLight()
    if (!status.derived?.klines_prerequisite) {
      return { started: false, running: false, message: '需先完成 K 线 Parquet 导入' }
    }
    const plan = resolveDerivedMaintenanceManualPlan(status, force)
    if (!plan) {
      return { started: false, running: false, message: '本地指标已是最新' }
    }
    void this.runMaintain(plan)
    return { started: true, running: true }
  }

  startRefreshScheduler(intervalMs = Number(process.env.OPPTRIX_DERIVED_REFRESH_INTERVAL_MS ?? 15 * 60 * 1000)): void {
    if (this.refreshTimer != null) return
    const tick = () => {
      if (this.running || this.isSyncRunning() || isMarketSyncActive() || isDerivedMaintenanceActive()) return
      const status = this.store.getStatusLight()
      if (!shouldAutoDerivedMaintenanceOnBoot(status)) return
      void this.runAutoMaintain()
    }
    this.refreshTimer = setInterval(tick, intervalMs)
    if (typeof this.refreshTimer === 'object' && 'unref' in this.refreshTimer) {
      this.refreshTimer.unref()
    }
  }

  stopRefreshScheduler(): void {
    if (this.refreshTimer != null) {
      clearInterval(this.refreshTimer)
      this.refreshTimer = null
    }
  }

  private async runAutoMaintain(): Promise<void> {
    if (this.running || this.isSyncRunning() || isMarketSyncActive() || isDerivedMaintenanceActive()) return

    const status = this.store.getStatusLight()
    const plan = resolveDerivedMaintenancePlan(status)
    if (!plan) {
      this.retryAttempts = 0
      return
    }

    await this.runMaintain(plan)
  }

  private async runMaintain(plan: DerivedMaintenancePlan): Promise<void> {
    if (this.running) return
    this.running = true
    const status = this.store.getStatusLight()
    this.store.freezeStatusLightForDerived(status)
    setDerivedMaintenanceActive(true)
    this.memoryLogs = []
    this.snapshot = {
      jobs_completed: 0,
      jobs_total: plan.jobs.length,
      overall_percent: computeDerivedOverallPercent(status.derived),
      current_job: plan.jobs[0] ?? null,
      job_current: 2,
      job_total: 100,
      message: '准备本地指标子进程…',
    }
    this.log(`${plan.label} · ${plan.jobs.join(' → ')}（子进程）`)

    let failed = false
    try {
      const gw = getMarketDuckGateway(this.store.klineDuckDbPath, this.store.dbPath)
      const tradeDate = status.derived?.kline_trade_date?.slice(0, 10)
        || status.last_sync.kline_bootstrap?.slice(0, 10)
        || status.last_sync.kline_daily?.slice(0, 10)
        || undefined
      const result = await gw.spawnDerivedMaintenanceAsync({
        jobs: [...plan.jobs],
        tradeDate,
        onEvent: event => this.handleSubprocessEvent(event, plan),
      })

      if (plan.jobs.includes('screen_factors') && !result.screen_factors) {
        throw new Error('因子计算子进程未返回结果（DuckDB 不可用）')
      }
      if (result.screen_factors?.computed === 0) {
        this.log('初选因子：无可匹配标的（请确认 DuckDB 名录与 K 线均已导入）')
      }

      applyDerivedMaintenanceResult(this.store, result, 'derived_maintenance')
      for (const job of plan.jobs) {
        this.log(`✓ 完成 · ${job}`)
      }

      const derived = this.store.getStatusLight().derived
      const overall = computeDerivedOverallPercent(derived ?? {
        ready: false,
        klines_prerequisite: false,
        screen_factors: false,
        industry_stats: false,
        factor_coverage_ratio: 0,
        factor_trade_date: null,
        kline_trade_date: null,
        industry_trade_date: null,
      })
      if (derived?.ready) {
        this.log('本地指标已就绪')
        this.retryAttempts = 0
      } else if (derived) {
        this.log(`本地指标维护结束（${overall}%）`)
        this.scheduleRetry(derived)
      } else {
        this.log(`本地指标维护结束（${overall}%）`)
      }
      this.snapshot = {
        ...this.snapshot,
        jobs_completed: plan.jobs.length,
        overall_percent: overall,
        message: derived?.ready ? '本地指标已就绪' : `本地指标构建中（${overall}%）`,
      }
    } catch (e) {
      failed = true
      const msg = e instanceof Error ? e.message : String(e)
      this.log(`本地指标维护失败：${msg}`)
      if (e instanceof Error && e.stack) this.log(e.stack)
      const derived = this.store.getStatusLight().derived
      if (derived && !derived.ready) this.scheduleRetry(derived)
    } finally {
      this.running = false
      setDerivedMaintenanceActive(false)
      this.store.unfreezeStatusLightCache()
      void this.store.flushDuckWritesAsync({ throwOnError: false })
    }
  }

  private handleSubprocessEvent(
    event: DerivedMaintenanceCliEvent,
    plan: DerivedMaintenancePlan,
  ): void {
    if (event.type === 'job_start' && event.job) {
      const index = plan.jobs.indexOf(event.job)
      this.snapshot = {
        ...this.snapshot,
        current_job: event.job,
        job_current: 0,
        job_total: 100,
        jobs_completed: index >= 0 ? index : this.snapshot.jobs_completed ?? 0,
      }
      this.log(`开始 · ${event.job}`)
      return
    }

    if (event.type === 'progress' && event.job) {
      const index = plan.jobs.indexOf(event.job)
      const current = event.current ?? 0
      const total = event.total ?? 100
      this.snapshot = {
        ...this.snapshot,
        current_job: event.job,
        job_current: current,
        job_total: total,
        message: event.message ?? null,
        overall_percent: index >= 0
          ? Math.round(((index + current / Math.max(total, 1)) / plan.jobs.length) * 1000) / 10
          : this.snapshot.overall_percent,
      }
      if (event.message) this.log(event.message)
      return
    }

    if (event.type === 'job_done' && event.job) {
      const index = plan.jobs.indexOf(event.job)
      this.snapshot = {
        ...this.snapshot,
        jobs_completed: index >= 0 ? index + 1 : this.snapshot.jobs_completed,
        job_current: 100,
        job_total: 100,
      }
    }
  }

  private scheduleRetry(derived: DerivedReadiness): void {
    if (derived.ready) {
      this.retryAttempts = 0
      return
    }
    if (this.retryAttempts >= RETRY_MAX) {
      this.log('本地指标仍未就绪，请稍后手动同步或等待定时刷新')
      return
    }
    if (this.retryTimer != null) clearTimeout(this.retryTimer)
    this.retryAttempts += 1
    const waitSec = Math.round(RETRY_MS / 1000)
    const hints: string[] = []
    if (!derived.screen_factors) hints.push('初选因子')
    if (!derived.industry_stats) hints.push('行业统计')
    this.log(`${hints.join('、')}待补全，${waitSec} 秒后继续…`)
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null
      this.autoMaintainOnBoot()
    }, RETRY_MS)
    if (typeof this.retryTimer === 'object' && 'unref' in this.retryTimer) {
      this.retryTimer.unref()
    }
  }

  private log(message: string): void {
    const line = `[${new Date().toLocaleTimeString('zh-CN', { hour12: false })}] ${message}`
    this.memoryLogs.push(line)
    if (this.memoryLogs.length > MAX_MEMORY_LOGS) this.memoryLogs.shift()
  }
}

let sharedDerivedCoordinator: MarketDerivedMaintenanceCoordinator | null = null

export function getMarketDerivedMaintenanceCoordinator(
  store: MarketDataStore,
  isSyncRunning: () => boolean,
): MarketDerivedMaintenanceCoordinator {
  if (!sharedDerivedCoordinator) {
    sharedDerivedCoordinator = new MarketDerivedMaintenanceCoordinator(store, isSyncRunning)
  } else {
    sharedDerivedCoordinator.setSyncRunningCheck(isSyncRunning)
  }
  return sharedDerivedCoordinator
}

export function resetSharedMarketDerivedMaintenanceCoordinator(): void {
  if (sharedDerivedCoordinator) {
    sharedDerivedCoordinator.stopRefreshScheduler()
  }
  sharedDerivedCoordinator = null
}
