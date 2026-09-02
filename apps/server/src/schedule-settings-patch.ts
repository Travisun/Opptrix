import {
  isRedactedSecret,
  normalizeScheduleNotifySettings,
  normalizeJobNotifyOverride,
  validateWebhookUrl,
} from '@opptrix/schedule'
import type {
  CreateScheduledJobInput,
  UpdateScheduledJobInput,
  ScheduleSettings,
  ScheduleNotifySettings,
  ScheduleJobNotifyOverride,
} from '@opptrix/user-store'

export function mergeNotifySettingsPatch(
  current: ScheduleNotifySettings,
  patch: Partial<ScheduleNotifySettings> | undefined,
): ScheduleNotifySettings {
  if (!patch) return current
  const mergedWebhooks = patch.webhooks !== undefined
    ? patch.webhooks.map(w => ({
      ...w,
      secret: isRedactedSecret(w.secret)
        ? current.webhooks.find(g => g.id === w.id)?.secret
        : w.secret,
    }))
    : current.webhooks

  const mergedSmtp = patch.smtp === undefined
    ? current.smtp
    : patch.smtp == null
      ? null
      : {
        ...(current.smtp ?? {
          host: '',
          port: 587,
          secure: false,
          user: '',
          password: '',
          from: '',
          email_format: 'both' as const,
        }),
        ...patch.smtp,
        password: isRedactedSecret(patch.smtp.password)
          ? (current.smtp?.password ?? '')
          : (patch.smtp.password ?? ''),
      }

  return normalizeScheduleNotifySettings({
    ...current,
    ...patch,
    webhooks: mergedWebhooks,
    smtp: mergedSmtp,
  })
}

export function mergeScheduleSettingsPatch(
  current: ScheduleSettings,
  patch: Partial<ScheduleSettings>,
): Partial<ScheduleSettings> {
  const { notify, ...rest } = patch
  return {
    ...rest,
    run_when_closed: false,
    notify: notify ? mergeNotifySettingsPatch(current.notify, notify) : undefined,
  }
}

export function validateNotifySettings(notify: ScheduleNotifySettings): string | null {
  for (const hook of notify.webhooks) {
    const err = validateWebhookUrl(hook.url, notify.allow_http_webhooks)
    if (err) return err
  }
  if (notify.email_enabled) {
    if (!notify.email_to.length) return '请填写至少一个邮件收件人'
    if (!notify.smtp?.host?.trim()) return '请填写 SMTP 服务器地址'
    if (!notify.smtp.from?.trim()) return '请填写发件人地址'
  }
  return null
}

export function sanitizeCreateJobInput(body: CreateScheduledJobInput): CreateScheduledJobInput {
  return {
    ...body,
    notify_override: body.notify_override != null
      ? normalizeJobNotifyOverride(body.notify_override)
      : undefined,
  }
}

export function sanitizeUpdateJobInput(body: UpdateScheduledJobInput): UpdateScheduledJobInput {
  const next: UpdateScheduledJobInput = { ...body }
  if (body.notify_override !== undefined) {
    next.notify_override = body.notify_override == null
      ? null
      : normalizeJobNotifyOverride(body.notify_override)
  }
  if (next.notify_override?.webhooks) {
    next.notify_override = {
      ...next.notify_override,
      webhooks: next.notify_override.webhooks.map(w => ({
        ...w,
        secret: isRedactedSecret(w.secret) ? undefined : w.secret,
      })),
    }
  }
  return next
}

export function mergeJobNotifyPatch(
  current: ScheduleJobNotifyOverride | null,
  patch: ScheduleJobNotifyOverride | null | undefined,
): ScheduleJobNotifyOverride | null {
  if (patch === undefined) return current
  if (patch === null) return null
  const normalized = normalizeJobNotifyOverride(patch)
  if (!normalized || normalized.notify_mode === 'inherit') {
    return { notify_mode: 'inherit' }
  }
  if (normalized.notify_mode === 'off') return { notify_mode: 'off' }
  if (normalized.webhooks && current?.webhooks) {
    normalized.webhooks = normalized.webhooks.map(w => ({
      ...w,
      secret: isRedactedSecret(w.secret)
        ? current.webhooks?.find(g => g.id === w.id)?.secret
        : w.secret,
    }))
  }
  return normalized
}
