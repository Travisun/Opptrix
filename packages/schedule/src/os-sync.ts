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

/** 根据 autostart 与任务 os_status 汇总系统定时健康状态（不含 launchd/cron 细节）。 */
export function computeOsHealth(
  settings: ScheduleSettings,
  jobs: ScheduledJob[],
): ScheduleOsHealth {
  if (!settings.autostart) {
    return {
      status: 'n/a',
      message: '未开启后台常驻，由应用内定时扫描执行',
      error: null,
      autostart: false,
    }
  }

  const enabled = jobs.filter(j => j.enabled)
  if (enabled.length === 0) {
    return {
      status: 'synced',
      message: '系统定时已就绪，当前没有启用的任务',
      error: settings.os_tick_error ?? null,
      autostart: true,
    }
  }

  const errored = enabled.filter(j => j.os_status === 'error')
  const pending = enabled.filter(j => j.os_status === 'pending' || j.os_status === 'n/a')

  if (errored.length > 0 || settings.os_tick_status === 'error') {
    return {
      status: 'error',
      message: '部分任务未能同步到系统定时，请重新注册',
      error: settings.os_tick_error ?? null,
      autostart: true,
    }
  }

  if (pending.length > 0 || settings.os_tick_status === 'pending') {
    return {
      status: 'pending',
      message: '正在等待系统定时同步完成',
      error: settings.os_tick_error ?? null,
      autostart: true,
    }
  }

  return {
    status: 'synced',
    message: '系统定时已与全部启用任务同步',
    error: settings.os_tick_error ?? null,
    autostart: true,
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

/** 重新向系统定时注册全部启用任务（桌面 autostart 开启时）。 */
export function resyncOsRegistration(actions: OsSyncActions): ScheduleOsHealth {
  const settings = actions.patchSettings({ os_tick_status: 'pending', os_tick_error: null })
  const jobs = actions.listJobs()

  if (!settings.autostart) {
    actions.patchSettings({ os_tick_status: 'n/a', os_tick_error: null })
    return computeOsHealth(actions.patchSettings({}), jobs)
  }

  try {
    for (const job of jobs) {
      if (!job.enabled) continue
      actions.updateJob(job.id, {
        os_status: 'synced',
        os_registration_id: job.os_registration_id ?? job.id,
      })
    }
    const next = actions.patchSettings({ os_tick_status: 'synced', os_tick_error: null })
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
