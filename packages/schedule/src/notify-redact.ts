import type {
  ScheduleJobNotifyOverride,
  ScheduleNotifySettings,
  ScheduleNotifyOn,
  ScheduleSettings,
  ScheduleSmtpConfig,
  ScheduleWebhookTarget,
  ScheduledJob,
  ScheduledJobRun,
} from '@opptrix/user-store'

const REDACTED = '••••••••'

export function redactSmtpForApi(smtp: ScheduleSmtpConfig | null): ScheduleSmtpConfig | null {
  if (!smtp) return null
  return {
    ...smtp,
    password: smtp.password ? REDACTED : '',
  }
}

export function redactWebhooksForApi(
  webhooks: ScheduleWebhookTarget[],
): ScheduleWebhookTarget[] {
  return webhooks.map(w => ({
    ...w,
    secret: w.secret ? REDACTED : undefined,
  }))
}

export function redactNotifySettingsForApi(
  notify: ScheduleNotifySettings,
): ScheduleNotifySettings {
  return {
    ...notify,
    webhooks: redactWebhooksForApi(notify.webhooks),
    smtp: redactSmtpForApi(notify.smtp),
  }
}

export function redactScheduleSettingsForApi(settings: ScheduleSettings): ScheduleSettings {
  return {
    ...settings,
    notify: redactNotifySettingsForApi(settings.notify),
  }
}

export function redactJobNotifyOverrideForApi(
  override: ScheduleJobNotifyOverride | null,
): ScheduleJobNotifyOverride | null {
  if (!override) return null
  if (override.webhooks) {
    return {
      ...override,
      webhooks: redactWebhooksForApi(override.webhooks),
    }
  }
  return override
}

export function redactScheduledJobForApi(job: ScheduledJob): ScheduledJob {
  return {
    ...job,
    notify_override: redactJobNotifyOverrideForApi(job.notify_override),
  }
}

export function isRedactedSecret(value: string | undefined): boolean {
  return value === REDACTED
}

export { REDACTED as SCHEDULE_SECRET_REDACTED }

export interface ResolvedScheduleNotify {
  notify_on: ScheduleNotifyOn
  allow_http_webhooks: boolean
  webhooks: ScheduleWebhookTarget[]
  email_enabled: boolean
  email_to: string[]
  smtp: ScheduleSmtpConfig | null
}

export function shouldNotifyForStatus(
  notifyOn: ScheduleNotifyOn,
  status: 'ok' | 'error',
): boolean {
  if (notifyOn === 'always') return true
  if (notifyOn === 'success') return status === 'ok'
  return status === 'error'
}

export function resolveEffectiveNotify(
  global: ScheduleNotifySettings,
  jobOverride: ScheduleJobNotifyOverride | null | undefined,
  runStatus: 'ok' | 'error',
): ResolvedScheduleNotify | null {
  const mode = jobOverride?.notify_mode ?? 'inherit'
  if (mode === 'off') return null
  if (!global.enabled && mode === 'inherit') return null

  if (mode === 'inherit') {
    if (!shouldNotifyForStatus(global.notify_on, runStatus)) return null
    return {
      notify_on: global.notify_on,
      allow_http_webhooks: global.allow_http_webhooks,
      webhooks: global.webhooks.filter(w => w.enabled),
      email_enabled: global.email_enabled,
      email_to: global.email_to,
      smtp: global.smtp,
    }
  }

  const notify_on = jobOverride?.notify_on ?? global.notify_on
  if (!shouldNotifyForStatus(notify_on, runStatus)) return null

  const jobWebhooks = jobOverride?.webhooks?.filter(w => w.enabled) ?? []
  const webhooks = jobWebhooks.length > 0 ? jobWebhooks : global.webhooks.filter(w => w.enabled)
  const email_enabled = jobOverride?.email_enabled ?? global.email_enabled
  const email_to = (jobOverride?.email_to?.length
    ? jobOverride.email_to
    : global.email_to)

  return {
    notify_on,
    allow_http_webhooks: global.allow_http_webhooks,
    webhooks,
    email_enabled,
    email_to,
    smtp: global.smtp,
  }
}

export interface ScheduleWebhookPayload {
  event: 'schedule.job.finished'
  job: {
    id: string
    title: string
    kind: string
  }
  run: {
    id: string
    trigger: string
    status: string
    started_at: string
    finished_at: string | null
  }
  summary: string | null
  error: string | null
  session_id: string | null
}

export function buildWebhookPayload(
  job: ScheduledJob,
  run: ScheduledJobRun,
  status: 'ok' | 'error',
  summary?: string | null,
  error?: string | null,
): ScheduleWebhookPayload {
  return {
    event: 'schedule.job.finished',
    job: {
      id: job.id,
      title: job.title,
      kind: job.kind,
    },
    run: {
      id: run.id,
      trigger: run.trigger,
      status: run.status,
      started_at: run.started_at,
      finished_at: run.finished_at,
    },
    summary: summary ?? run.summary,
    error: error ?? run.error,
    session_id: run.session_id,
  }
}

export function validateWebhookUrl(url: string, allowHttp: boolean): string | null {
  const trimmed = url.trim()
  if (!trimmed) return 'Webhook 地址不能为空'
  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    return 'Webhook 地址格式无效'
  }
  if (parsed.protocol === 'https:') return null
  if (parsed.protocol === 'http:' && allowHttp) return null
  return allowHttp
    ? 'Webhook 须使用 http:// 或 https://'
    : 'Webhook 须使用 https://；可在通知设置中允许 HTTP'
}
