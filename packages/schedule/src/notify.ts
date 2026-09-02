import type {
  ScheduleNotifySettings,
  ScheduleSettings,
  ScheduledJob,
} from '@opptrix/user-store'
import type { ScheduleJobNotificationEvent } from './runner.js'
import {
  buildWebhookPayload,
  resolveEffectiveNotify,
} from './notify-redact.js'
import { dispatchResolvedNotify } from './notify-dispatch.js'

export type ScheduleNotifyLogger = (msg: string, err?: unknown) => void

export function createScheduleNotificationDispatcher(deps: {
  getSettings: () => ScheduleSettings
  getJob: (id: string) => ScheduledJob | null
  log?: ScheduleNotifyLogger
}): (event: ScheduleJobNotificationEvent) => Promise<void> {
  return async (event) => {
    if (event.status !== 'ok' && event.status !== 'error') return
    const settings = deps.getSettings()
    const job = deps.getJob(event.job.id) ?? event.job
    const resolved = resolveEffectiveNotify(
      settings.notify,
      job.notify_override,
      event.status,
    )
    if (!resolved) return
    if (resolved.webhooks.length === 0 && !(resolved.email_enabled && resolved.smtp && resolved.email_to.length)) {
      return
    }
    const payload = buildWebhookPayload(
      job,
      event.run,
      event.status,
      event.summary,
      event.error,
    )
    await dispatchResolvedNotify(resolved, payload, deps.log)
  }
}

export async function sendScheduleTestNotification(opts: {
  settings: ScheduleNotifySettings
  channel: 'webhook' | 'email'
  webhookId?: string
}): Promise<void> {
  const now = new Date().toISOString()
  const payload = buildWebhookPayload(
    {
      id: 'test',
      title: '通知测试',
      kind: 'agent_prompt',
    } as ScheduledJob,
    {
      id: 'test-run',
      job_id: 'test',
      started_at: now,
      finished_at: now,
      status: 'ok',
      trigger: 'manual',
      summary: '这是一条测试通知，用于确认 Webhook 或邮件配置可用。',
      error: null,
      session_id: null,
    },
    'ok',
    '这是一条测试通知，用于确认 Webhook 或邮件配置可用。',
    null,
  )

  if (opts.channel === 'webhook') {
    const hooks = opts.webhookId
      ? opts.settings.webhooks.filter(w => w.id === opts.webhookId && w.enabled)
      : opts.settings.webhooks.filter(w => w.enabled)
    if (hooks.length === 0) throw new Error('没有可用的 Webhook')
    const { postScheduleWebhook } = await import('./notify-dispatch.js')
    for (const hook of hooks) {
      await postScheduleWebhook(hook.url, payload, hook.secret)
    }
    return
  }

  if (!opts.settings.email_enabled || !opts.settings.smtp || opts.settings.email_to.length === 0) {
    throw new Error('请先配置邮件通知与 SMTP')
  }
  const { sendScheduleSmtpMail, buildScheduleEmailLines } = await import('./notify-dispatch.js')
  await sendScheduleSmtpMail({
    smtp: opts.settings.smtp,
    to: opts.settings.email_to,
    subject: '计划任务通知测试',
    lines: buildScheduleEmailLines(payload),
  })
}
