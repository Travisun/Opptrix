import type { MarketDbStatus } from '../store.js'
import {
  AUTO_BOOT_EXCLUDED_JOBS,
  CN_BOOTSTRAP_SYNC_JOBS,
  DEFAULT_AUTO_SYNC_JOBS,
  SYNC_JOB_CONFIG,
} from './config.js'
import type { SyncMode } from './engine.js'
import { daysSince } from '../utils.js'
import { cnMaintenanceJobsDue } from './schedule.js'
import type { MarketDataPackId } from '@opptrix/shared'
import { jobsForMarketPack } from './market-packs.js'

export interface SyncPlan {
  mode: SyncMode
  jobs: readonly string[]
  /** Short label for UI / API message */
  label: string
}

export interface SyncSessionHint {
  status?: string
  mode?: string
  jobs_total?: number
}

function jobNeedsRefresh(job: string, lastSync: Record<string, string | null>): boolean {
  const cfg = SYNC_JOB_CONFIG[job]
  if (!cfg?.ttlDays) return true
  const last = lastSync[job] ?? null
  if (!last) return true
  return daysSince(last) >= cfg.ttlDays
}

function jobsNeedingRefresh(
  jobs: readonly string[],
  lastSync: Record<string, string | null>,
): string[] {
  return jobs.filter(j => jobNeedsRefresh(j, lastSync))
}

/** 就绪后维护任务是否有任一到期 */
export function dailyJobsNeedRefresh(status: MarketDbStatus): boolean {
  return cnMaintenanceJobsDue(status.last_sync).length > 0
}

/** 初选包 readiness 门槛是否仍未满足（与 TTL 无关，避免 cursor 已写但覆盖率不足时不再自动同步） */
function bootstrapReadinessIncomplete(status: MarketDbStatus): boolean {
  if (status.is_ready) return false
  const b = status.bootstrap
  if (!b) return status.stock_count > 0
  if (!b.initial_cn || !b.initial_taxonomy || !b.klines) return true
  return false
}

/** 首次 pipeline 是否仍有 job 未跑过或已过期 */
export function bootstrapJobsNeedRefresh(status: MarketDbStatus): boolean {
  if (bootstrapReadinessIncomplete(status)) return true
  return jobsNeedingRefresh([...DEFAULT_AUTO_SYNC_JOBS], status.last_sync).length > 0
}

/**
 * Pick sync mode + job list from DB state.
 *
 * - 未完成 bootstrap → 名录 + 行业 + 历史 K 补全（按 TTL 跳过未到期项）
 * - 已就绪 → 维护：名录/行业每周交替；日 K 周一收盘后增量
 */
export function resolveSyncPlan(
  status: MarketDbStatus,
  session?: SyncSessionHint | null,
): SyncPlan {
  const hasProgress = Object.values(status.job_progress).some(p => p.done > 0)
  const interrupted = session?.status === 'interrupted' || session?.status === 'partial'

  if (interrupted || (!status.is_ready && status.stock_count > 0 && hasProgress)) {
    const jobs = jobsNeedingRefresh([...CN_BOOTSTRAP_SYNC_JOBS], status.last_sync)
    return {
      mode: 'resume',
      jobs: jobs.length ? jobs : [...CN_BOOTSTRAP_SYNC_JOBS],
      label: '接续同步',
    }
  }

  if (status.is_ready) {
    const jobs = cnMaintenanceJobsDue(status.last_sync)
    return {
      mode: 'incremental',
      jobs,
      label: '增量更新',
    }
  }

  const jobs = jobsNeedingRefresh([...CN_BOOTSTRAP_SYNC_JOBS], status.last_sync)
  return {
    mode: 'incremental',
    jobs: jobs.length ? jobs : [...CN_BOOTSTRAP_SYNC_JOBS],
    label: status.stock_count > 0 ? '增量同步' : '首次同步',
  }
}

/** Legacy session → CN bootstrap pipeline only. */
export function resolveResumeJobs(_session: SyncSessionHint): readonly string[] {
  return [...CN_BOOTSTRAP_SYNC_JOBS]
}

/** Whether boot should auto-start sync without user action. */
export function shouldAutoSyncOnBoot(
  status: MarketDbStatus,
  session?: SyncSessionHint | null,
): boolean {
  const hasProgress = Object.values(status.job_progress).some(p => p.done > 0)
  const interrupted = session?.status === 'interrupted' || session?.status === 'partial'

  if (interrupted || (!status.is_ready && status.stock_count > 0 && hasProgress)) {
    return true
  }

  if (!status.is_ready) return bootstrapJobsNeedRefresh(status)

  return dailyJobsNeedRefresh(status)
}

/** Strip deep / cross-market jobs from automatic boot. */
export function filterJobsForAutoBoot(jobs: readonly string[]): string[] {
  return jobs.filter(j => !AUTO_BOOT_EXCLUDED_JOBS.has(j))
}

/** Plan for automatic sync on app/server start; null when data is fresh. */
export function resolveAutoBootPlan(
  status: MarketDbStatus,
  session?: SyncSessionHint | null,
): SyncPlan | null {
  if (!shouldAutoSyncOnBoot(status, session)) return null

  let plan = resolveSyncPlan(status, session)
  if (plan.mode === 'resume' && session) {
    const jobs = [...resolveResumeJobs(session)]
    return jobs.length ? { ...plan, jobs } : null
  }

  const jobs = filterJobsForAutoBoot(plan.jobs)
  if (jobs.length === 0) return null
  plan = { ...plan, jobs }
  return plan
}

export function resolveMarketPackSyncPlan(pack: MarketDataPackId, force = false): SyncPlan {
  const jobs = [...jobsForMarketPack(pack)]
  return {
    mode: force ? 'full' : 'incremental',
    jobs,
    label: force ? `准备${pack}数据包（全量）` : `准备${pack}数据包`,
  }
}
