import type { MarketDbStatus } from '../store.js'
import { ALL_SYNC_JOBS, BOOTSTRAP_SYNC_JOBS, DAILY_SYNC_JOBS, SYNC_JOB_CONFIG } from './config.js'
import type { SyncMode } from './engine.js'
import { daysSince } from '../utils.js'

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

/** True if any daily-essential job is past its TTL cursor. */
export function dailyJobsNeedRefresh(status: MarketDbStatus): boolean {
  return DAILY_SYNC_JOBS.some(job => jobNeedsRefresh(job, status.last_sync))
}

/**
 * Pick sync mode + job list from DB state (no user-facing mode buttons).
 *
 * - Interrupted / incomplete build → resume
 * - Ready → incremental daily essentials (quotes/announcements/factors…)
 * - Otherwise → incremental full pipeline (first-time build)
 */
export function resolveSyncPlan(
  status: MarketDbStatus,
  session?: SyncSessionHint | null,
): SyncPlan {
  const hasProgress = Object.values(status.job_progress).some(p => p.done > 0)
  const interrupted = session?.status === 'interrupted' || session?.status === 'partial'

  if (interrupted || (!status.is_ready && status.stock_count > 0 && hasProgress)) {
    return {
      mode: 'resume',
      jobs: BOOTSTRAP_SYNC_JOBS,
      label: '接续同步',
    }
  }

  if (status.is_ready) {
    return {
      mode: 'incremental',
      jobs: DAILY_SYNC_JOBS,
      label: '增量更新',
    }
  }

  return {
    mode: 'incremental',
    jobs: BOOTSTRAP_SYNC_JOBS,
    label: status.stock_count > 0 ? '增量同步' : '首次同步',
  }
}

/** Job list for an interrupted session (bootstrap vs full pipeline). */
export function resolveResumeJobs(session: SyncSessionHint): readonly string[] {
  if (session.jobs_total === DAILY_SYNC_JOBS.length) return DAILY_SYNC_JOBS
  if (session.jobs_total === BOOTSTRAP_SYNC_JOBS.length) return BOOTSTRAP_SYNC_JOBS
  if (session.jobs_total === ALL_SYNC_JOBS.length) return ALL_SYNC_JOBS
  return BOOTSTRAP_SYNC_JOBS
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

  if (!status.is_ready) return true

  return dailyJobsNeedRefresh(status)
}

/** Plan for automatic sync on app/server start; null when data is fresh. */
export function resolveAutoBootPlan(
  status: MarketDbStatus,
  session?: SyncSessionHint | null,
): SyncPlan | null {
  if (!shouldAutoSyncOnBoot(status, session)) return null

  const plan = resolveSyncPlan(status, session)
  if (plan.mode === 'resume' && session) {
    return { ...plan, jobs: resolveResumeJobs(session) }
  }
  return plan
}
