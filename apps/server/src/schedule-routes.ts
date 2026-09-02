import type { FastifyInstance, FastifyRequest } from 'fastify'
import {
  getScheduleService,
  computeOsHealth,
  resyncOsRegistration,
  scheduleJobSummary,
  redactScheduleSettingsForApi,
  redactScheduledJobForApi,
  sendScheduleTestNotification,
  type ScheduleService,
} from '@opptrix/schedule'
import type {
  CreateScheduledJobInput,
  ScheduleSettings,
  UpdateScheduledJobInput,
} from '@opptrix/user-store'
import {
  mergeScheduleSettingsPatch,
  validateNotifySettings,
  sanitizeCreateJobInput,
  sanitizeUpdateJobInput,
  mergeJobNotifyPatch,
} from './schedule-settings-patch.js'

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

const testNotifyLastAt = new Map<string, number>()
const TEST_NOTIFY_COOLDOWN_MS = 15_000

export function registerScheduleRoutes(
  app: FastifyInstance,
  scheduleService: ScheduleService = getScheduleService(),
): void {
  app.get('/api/schedule/settings', async () => ({
    settings: redactScheduleSettingsForApi(scheduleService.getSettings()),
  }))

  app.patch<{ Body: Partial<ScheduleSettings> & { resync_os?: boolean } }>(
    '/api/schedule/settings',
    async (req, reply) => {
      const body = req.body ?? {}
      let os = computeOsHealth(scheduleService.getSettings(), scheduleService.listJobs())

      if (body.resync_os === true) {
        os = resyncOsRegistration(scheduleService)
      }

      const { resync_os: _resync, run_when_closed: _ignoredRwc, ...rest } = body
      const current = scheduleService.getSettings()
      const merged = mergeScheduleSettingsPatch(current, rest)
      if (merged.notify) {
        const err = validateNotifySettings(merged.notify)
        if (err) return reply.status(400).send({ error: err })
      }

      const needsReconcilePending = (
        merged.master_enabled !== undefined && merged.master_enabled !== current.master_enabled
      ) || (
        merged.autostart !== undefined && merged.autostart !== current.autostart
      )
      const nextPatch = {
        ...merged,
        ...(needsReconcilePending && !body.resync_os
          ? { os_tick_status: 'pending' as const, os_tick_error: null }
          : {}),
      }

      const settings = Object.keys(nextPatch).length > 0
        ? scheduleService.patchSettings(nextPatch)
        : scheduleService.getSettings()

      if (body.resync_os !== true) {
        os = computeOsHealth(settings, scheduleService.listJobs())
      }

      return {
        settings: redactScheduleSettingsForApi(settings),
        os,
      }
    },
  )

  app.post<{ Body: { channel?: 'webhook' | 'email'; webhook_id?: string } }>(
    '/api/schedule/notify/test',
    async (req, reply) => {
      const channel = req.body?.channel
      if (channel !== 'webhook' && channel !== 'email') {
        return reply.status(400).send({ error: '请指定 channel 为 webhook 或 email' })
      }
      const key = `${req.ip}:${channel}:${req.body?.webhook_id ?? ''}`
      const now = Date.now()
      const last = testNotifyLastAt.get(key) ?? 0
      if (now - last < TEST_NOTIFY_COOLDOWN_MS) {
        return reply.status(429).send({ error: '测试通知发送过于频繁，请稍后再试' })
      }
      testNotifyLastAt.set(key, now)
      const settings = scheduleService.getSettings()
      try {
        await sendScheduleTestNotification({
          settings: settings.notify,
          channel,
          webhookId: req.body?.webhook_id,
        })
        return { ok: true }
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e)
        return reply.status(400).send({ error: message })
      }
    },
  )

  app.get('/api/schedule/jobs', async () => ({
    jobs: scheduleService.listJobs().map(redactScheduledJobForApi),
  }))

  app.get<{ Params: { id: string } }>('/api/schedule/jobs/:id', async (req, reply) => {
    const job = scheduleService.getJob(req.params.id)
    if (!job) return reply.status(404).send({ error: '计划任务不存在' })
    return { job: redactScheduledJobForApi(job) }
  })

  app.post<{ Body: CreateScheduledJobInput }>('/api/schedule/jobs', async (req, reply) => {
    try {
      const job = scheduleService.createJob(sanitizeCreateJobInput(req.body))
      return { job: redactScheduledJobForApi(job) }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      return reply.status(400).send({ error: message })
    }
  })

  app.patch<{ Params: { id: string }; Body: UpdateScheduledJobInput }>(
    '/api/schedule/jobs/:id',
    async (req, reply) => {
      try {
        const current = scheduleService.getJob(req.params.id)
        if (!current) return reply.status(404).send({ error: '计划任务不存在' })
        const body = sanitizeUpdateJobInput(req.body ?? {})
        if (body.notify_override !== undefined) {
          body.notify_override = mergeJobNotifyPatch(current.notify_override, body.notify_override)
        }
        const job = scheduleService.updateJob(req.params.id, body)
        if (!job) return reply.status(404).send({ error: '计划任务不存在' })
        return { job: redactScheduledJobForApi(job) }
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
      run_when_closed: false,
      allow_shell_scripts: settings.allow_shell_scripts,
      autostart: settings.autostart,
      notify_enabled: settings.notify.enabled,
      scheduler_mode: 'server',
      os,
      jobs: scheduleJobSummary(jobs),
      enabled_jobs: scheduleJobSummary(jobs).enabled,
      recent_failures: recentFailures,
      recent_failure_count: recentFailures.length,
    }
  })

  app.get('/api/schedule/os/reconcile', async () => {
    const settings = scheduleService.getSettings()
    return {
      mode: 'server',
      register_tick: false,
      run_when_closed: false,
      autostart: settings.autostart,
      interval_sec: 60,
      os_tick_status: 'n/a',
      os_tick_error: null,
      desktop_required: false,
    }
  })
}
