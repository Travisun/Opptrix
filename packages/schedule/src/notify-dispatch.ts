import { createHmac, timingSafeEqual } from 'node:crypto'
import type { ScheduleSmtpConfig } from '@opptrix/user-store'
import type { ScheduleWebhookPayload } from './notify-redact.js'
import {
  computeWebhookRetryDelayMs,
  isWebhookHttpStatusRetryable,
  parseRetryAfterMs,
  resolveWebhookRetryPolicy,
  shouldRetryWebhookAttempt,
  type ScheduleWebhookRetryPolicy,
} from './webhook-retry.js'

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export function signWebhookBody(body: string, secret: string): string {
  return createHmac('sha256', secret).update(body, 'utf8').digest('hex')
}

export type WebhookDeliveryAttemptLogger = (
  info: {
    url: string
    attempt: number
    maxAttempts: number
    delayMs?: number
    status?: number
    error?: string
  },
) => void

async function deliverWebhookOnce(
  url: string,
  body: string,
  secret: string | undefined,
  timeoutMs: number,
): Promise<{ ok: true } | { ok: false; status?: number; retryAfterMs?: number | null; error: Error }> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': 'Opptrix-Schedule/1.0',
    }
    if (secret?.trim()) {
      headers['X-Opptrix-Signature'] = `sha256=${signWebhookBody(body, secret.trim())}`
    }
    const resp = await fetch(url, {
      method: 'POST',
      headers,
      body,
      signal: controller.signal,
    })
    if (resp.ok) return { ok: true }
    const status = resp.status
    const retryAfterMs = parseRetryAfterMs(resp.headers.get('retry-after'))
    if (!isWebhookHttpStatusRetryable(status)) {
      return {
        ok: false,
        status,
        retryAfterMs,
        error: new Error(`Webhook 不可重试：HTTP ${status}`),
      }
    }
    return {
      ok: false,
      status,
      retryAfterMs,
      error: new Error(`HTTP ${status}`),
    }
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e))
    if (err.name === 'AbortError') {
      return { ok: false, error: new Error('Webhook 请求超时') }
    }
    return { ok: false, error: err }
  } finally {
    clearTimeout(timer)
  }
}

export async function postScheduleWebhook(
  url: string,
  payload: ScheduleWebhookPayload,
  secret?: string,
  opts?: {
    policy?: ScheduleWebhookRetryPolicy
    onAttempt?: WebhookDeliveryAttemptLogger
  },
): Promise<void> {
  const policy = opts?.policy ?? resolveWebhookRetryPolicy()
  const body = JSON.stringify(payload)
  let lastError: Error | null = null

  for (let attempt = 0; attempt < policy.maxAttempts; attempt += 1) {
    const result = await deliverWebhookOnce(url, body, secret, policy.timeoutMs)
    if (result.ok) {
      opts?.onAttempt?.({
        url,
        attempt: attempt + 1,
        maxAttempts: policy.maxAttempts,
      })
      return
    }

    lastError = result.error
    const canRetry = shouldRetryWebhookAttempt(attempt, policy)
      && (result.status === undefined || isWebhookHttpStatusRetryable(result.status))

    if (!canRetry) {
      opts?.onAttempt?.({
        url,
        attempt: attempt + 1,
        maxAttempts: policy.maxAttempts,
        status: result.status,
        error: result.error.message,
      })
      break
    }

    const retryAfterMs = result.retryAfterMs
    const delayMs = retryAfterMs != null && retryAfterMs > 0
      ? Math.min(policy.maxDelayMs, retryAfterMs)
      : computeWebhookRetryDelayMs(attempt, policy)

    opts?.onAttempt?.({
      url,
      attempt: attempt + 1,
      maxAttempts: policy.maxAttempts,
      status: result.status,
      error: result.error.message,
      delayMs,
    })

    await sleep(delayMs)
  }

  throw lastError ?? new Error('Webhook 发送失败')
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function buildEmailBodies(
  subject: string,
  lines: string[],
  format: ScheduleSmtpConfig['email_format'],
): { text: string; html?: string } {
  const text = [subject, '', ...lines].join('\n')
  if (format === 'text') return { text }
  const htmlBody = lines.map(l => `<p>${escapeHtml(l)}</p>`).join('')
  const html = `<!DOCTYPE html><html><body><h2>${escapeHtml(subject)}</h2>${htmlBody}</body></html>`
  if (format === 'html') return { text, html }
  return { text, html }
}

/** 轻量 SMTP 发送（LOGIN + multipart alternative） */
export async function sendScheduleSmtpMail(opts: {
  smtp: ScheduleSmtpConfig
  to: string[]
  subject: string
  lines: string[]
}): Promise<void> {
  const { smtp, to, subject, lines } = opts
  if (!smtp.host.trim() || !smtp.from.trim() || to.length === 0) {
    throw new Error('邮件配置不完整')
  }
  const nodemailer = await import('nodemailer')
  const transport = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    auth: smtp.user
      ? { user: smtp.user, pass: smtp.password }
      : undefined,
  })
  const bodies = buildEmailBodies(subject, lines, smtp.email_format)
  await transport.sendMail({
    from: smtp.from,
    to: to.join(', '),
    subject,
    text: bodies.text,
    ...(bodies.html ? { html: bodies.html } : {}),
  })
}

export function buildScheduleEmailLines(
  payload: ScheduleWebhookPayload,
): string[] {
  const statusLabel = payload.run.status === 'ok' ? '成功' : '失败'
  const lines = [
    `任务：${payload.job.title}`,
    `状态：${statusLabel}`,
    `开始：${payload.run.started_at}`,
    `结束：${payload.run.finished_at ?? '—'}`,
  ]
  if (payload.summary?.trim()) lines.push(`摘要：${payload.summary.trim()}`)
  if (payload.error?.trim()) lines.push(`错误：${payload.error.trim()}`)
  if (payload.session_id) lines.push(`会话：${payload.session_id}`)
  return lines
}

export async function dispatchResolvedNotify(
  resolved: {
    webhooks: Array<{ url: string; secret?: string }>
    email_enabled: boolean
    email_to: string[]
    smtp: ScheduleSmtpConfig | null
  },
  payload: ScheduleWebhookPayload,
  log?: (msg: string, err?: unknown) => void,
): Promise<void> {
  const tasks: Promise<void>[] = []
  for (const hook of resolved.webhooks) {
    tasks.push(
      postScheduleWebhook(hook.url, payload, hook.secret, {
        onAttempt: (info) => {
          if (info.delayMs != null) {
            log?.(
              `schedule webhook retry ${info.attempt}/${info.maxAttempts} in ${info.delayMs}ms: ${hook.url}`,
              info.error,
            )
          }
        },
      }).catch((err) => {
        log?.(`schedule webhook failed after retries: ${hook.url}`, err)
      }),
    )
  }
  if (resolved.email_enabled && resolved.smtp && resolved.email_to.length > 0) {
    const subject = `计划任务${payload.run.status === 'ok' ? '完成' : '失败'}：${payload.job.title}`
    tasks.push(
      sendScheduleSmtpMail({
        smtp: resolved.smtp,
        to: resolved.email_to,
        subject,
        lines: buildScheduleEmailLines(payload),
      }).catch((err) => {
        log?.('schedule email failed', err)
      }),
    )
  }
  await Promise.all(tasks)
}

export function verifyWebhookSignature(
  body: string,
  secret: string,
  header: string | undefined,
): boolean {
  if (!secret.trim() || !header?.startsWith('sha256=')) return false
  const expected = signWebhookBody(body, secret.trim())
  const got = header.slice('sha256='.length)
  try {
    const a = Buffer.from(expected, 'utf8')
    const b = Buffer.from(got, 'utf8')
    return a.length === b.length && timingSafeEqual(a, b)
  } catch {
    return false
  }
}
