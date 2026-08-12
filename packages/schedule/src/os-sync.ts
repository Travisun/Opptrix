import type {
  ScheduleOsStatus,
  ScheduleSettings,
  ScheduledJob,
} from '@opptrix/user-store'

export interface ScheduleOsHealth {
  status: ScheduleOsStatus
  message: string
  error: string | null
  autostart: boolean
}

function enabledJobCount(jobs: ScheduledJob[]): number {
  return jobs.filter(j => j.enabled).length
}

/**
 * 进程内调度健康摘要。OS 级 tick 已废除；关闭到托盘仍执行，完全退出则不执行。
 * `run_when_closed` 字段保留兼容，但不影响注册（永远不注册 OS tick）。
 */
export function computeOsHealth(
  settings: ScheduleSettings,
  _jobs: ScheduledJob[],
): ScheduleOsHealth {
  if (!settings.master_enabled) {
    return {
      status: 'n/a',
      message: '计划任务已关闭，不会自动执行',
      error: null,
      autostart: settings.autostart,
    }
  }

  return {
    status: 'n/a',
    message: settings.autostart
      ? '登录后可在托盘常驻并按计划执行；完全退出应用后不会执行'
      : '应用运行或驻留托盘时按计划执行；完全退出后不会执行',
    error: null,
    autostart: settings.autostart,
  }
}

export interface OsSyncActions {
  patchSettings(patch: Partial<ScheduleSettings>): ScheduleSettings
  listJobs(): ScheduledJob[]
  updateJob(
    id: string,
    patch: { os_status?: ScheduleOsStatus; os_registration_id?: string | null },
  ): ScheduledJob | null
}

/**
 * 清理遗留 OS 注册状态（不再向系统注册 tick）。
 * 将全局与任务级 os_* 字段置为 n/a / null。
 */
export function resyncOsRegistration(actions: OsSyncActions): ScheduleOsHealth {
  const jobs = actions.listJobs()
  try {
    for (const job of jobs) {
      if (job.os_status !== 'n/a' || job.os_registration_id != null) {
        actions.updateJob(job.id, {
          os_status: 'n/a',
          os_registration_id: null,
        })
      }
    }
    const next = actions.patchSettings({
      run_when_closed: false,
      os_tick_status: 'n/a',
      os_tick_error: null,
    })
    return computeOsHealth(next, actions.listJobs())
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    const next = actions.patchSettings({ os_tick_status: 'error', os_tick_error: message })
    return computeOsHealth(next, actions.listJobs())
  }
}

export function scheduleJobSummary(jobs: ScheduledJob[]): {
  total: number
  enabled: number
  disabled: number
  next_due: string | null
} {
  const enabledJobs = jobs.filter(j => j.enabled)
  const dueTimes = enabledJobs
    .map(j => j.next_run_at)
    .filter((t): t is string => Boolean(t))
    .sort()
  return {
    total: jobs.length,
    enabled: enabledJobs.length,
    disabled: jobs.length - enabledJobs.length,
    next_due: dueTimes[0] ?? null,
  }
}

export { enabledJobCount }
