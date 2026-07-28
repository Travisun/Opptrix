import type { FastifyInstance, FastifyRequest } from 'fastify'
import {
  getScheduleService,
  computeOsHealth,
  resyncOsRegistration,
  scheduleJobSummary,
  type ScheduleService,
} from '@opptrix/schedule'
import type {
  CreateScheduledJobInput,
  ScheduleSettings,
  UpdateScheduledJobInput,
} from '@opptrix/user-store'

function isLocalhost(req: FastifyRequest): boolean {
  const ip = req.ip
  return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1'
}

function summarizeRecentFailures(scheduleService: ScheduleService) {
  const jobs = scheduleService.listJobs()
  const failures: Array<{
    job_id: string
    job_title: string
    run_id: string
    started_at: string
    error: string | null
  }> = []

  for (const job of jobs) {
    for (const run of scheduleService.listRuns(job.id, 3)) {
      if (run.status !== 'error') continue
      failures.push({
        job_id: job.id,
        job_title: job.title,
        run_id: run.id,
        started_at: run.started_at,
        error: run.error,
      })
    }
  }

  failures.sort((a, b) => b.started_at.localeCompare(a.started_at))
  return failures.slice(0, 5)
}

export function registerScheduleRoutes(
  app: FastifyInstance,
  scheduleService: ScheduleService = getScheduleService(),
): void {
  app.get('/api/schedule/settings', async () => ({
    settings: scheduleService.getSettings(),
  }))

  app.patch<{ Body: Partial<ScheduleSettings> & { resync_os?: boolean } }>(
    '/api/schedule/settings',
    async (req) => {
      const body = req.body ?? {}
      let os = computeOsHealth(scheduleService.getSettings(), scheduleService.listJobs())

      if (body.resync_os === true) {
        os = resyncOsRegistration(scheduleService)
      }

      const { resync_os: _resync, ...patch } = body
      const current = scheduleService.getSettings()
      const needsOsPending = (
        patch.master_enabled !== undefined && patch.master_enabled !== current.master_enabled
      ) || (
        patch.autostart !== undefined && patch.autostart !== current.autostart
      )
      const nextPatch = needsOsPending && !body.resync_os
        ? { ...patch, os_tick_status: 'pending' as const, os_tick_error: null }
        : patch

      const settings = Object.keys(nextPatch).length > 0
        ? scheduleService.patchSettings(nextPatch)
        : scheduleService.getSettings()

      return { settings, os }
    },
  )

  app.get('/api/schedule/jobs', async () => ({
    jobs: scheduleService.listJobs(),
  }))

  app.get<{ Params: { id: string } }>('/api/schedule/jobs/:id', async (req, reply) => {
    const job = scheduleService.getJob(req.params.id)
    if (!job) return reply.status(404).send({ error: '计划任务不存在' })
    return { job }
  })

  app.post<{ Body: CreateScheduledJobInput }>('/api/schedule/jobs', async (req, reply) => {
    try {
      const job = scheduleService.createJob(req.body)
      return { job }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      return reply.status(400).send({ error: message })
    }
  })

  app.patch<{ Params: { id: string }; Body: UpdateScheduledJobInput }>(
    '/api/schedule/jobs/:id',
    async (req, reply) => {
      try {
        const job = scheduleService.updateJob(req.params.id, req.body ?? {})
        if (!job) return reply.status(404).send({ error: '计划任务不存在' })
        return { job }
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e)
        return reply.status(400).send({ error: message })
      }
    },
  )

  app.delete<{ Params: { id: string } }>('/api/schedule/jobs/:id', async (req, reply) => {
    const deleted = scheduleService.deleteJob(req.params.id)
    if (!deleted) return reply.status(404).send({ error: '计划任务不存在' })
    return { deleted: true }
  })

  app.post<{ Params: { id: string } }>('/api/schedule/jobs/:id/run', async (req, reply) => {
    try {
      const run = await scheduleService.runNow(req.params.id, 'manual')
      return { run }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      if (message.includes('不存在')) {
        return reply.status(404).send({ error: message })
      }
      return reply.status(400).send({ error: message })
    }
  })

  app.post('/api/schedule/tick', async (req, reply) => {
    if (!isLocalhost(req)) {
      return reply.status(403).send({ error: '仅允许本机调用' })
    }
    const result = await scheduleService.tick({ trigger: 'os' })
    return { result }
  })

  app.get('/api/schedule/status', async () => {
    const settings = scheduleService.getSettings()
    const jobs = scheduleService.listJobs()
    const os = computeOsHealth(settings, jobs)
    const recentFailures = summarizeRecentFailures(scheduleService)
    return {
      master_enabled: settings.master_enabled,
      allow_shell_scripts: settings.allow_shell_scripts,
      autostart: settings.autostart,
      os,
      jobs: scheduleJobSummary(jobs),
      enabled_jobs: scheduleJobSummary(jobs).enabled,
      recent_failures: recentFailures,
      recent_failure_count: recentFailures.length,
    }
  })

  app.get('/api/schedule/os/reconcile', async () => {
    const settings = scheduleService.getSettings()
    const isDesktop = process.env.OPPTRIX_DESKTOP === '1'
    return {
      register_tick: settings.master_enabled,
      autostart: settings.autostart,
      interval_sec: 60,
      os_tick_status: settings.os_tick_status ?? (isDesktop ? 'pending' : 'n/a'),
      os_tick_error: settings.os_tick_error ?? null,
      desktop_required: true,
    }
  })
}
