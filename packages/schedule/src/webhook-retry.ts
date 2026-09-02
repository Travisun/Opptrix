/** Webhook 派发重试策略（指数退避 + 抖动） */

export interface ScheduleWebhookRetryPolicy {
  maxAttempts: number
  baseDelayMs: number
  maxDelayMs: number
  timeoutMs: number
}

/** 单次重试等待上限：24 小时 */
export const SCHEDULE_WEBHOOK_MAX_DELAY_MS_DEFAULT = 24 * 60 * 60 * 1000

const DEFAULT_POLICY: ScheduleWebhookRetryPolicy = {
  maxAttempts: 5,
  baseDelayMs: 1_000,
  maxDelayMs: SCHEDULE_WEBHOOK_MAX_DELAY_MS_DEFAULT,
  timeoutMs: 10_000,
}

function readPositiveInt(envVal: string | undefined, fallback: number): number {
  if (!envVal?.trim()) return fallback
  const n = Number.parseInt(envVal, 10)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

export function resolveWebhookRetryPolicy(
  env: NodeJS.ProcessEnv = process.env,
): ScheduleWebhookRetryPolicy {
  return {
    maxAttempts: readPositiveInt(env.OPPTRIX_SCHEDULE_WEBHOOK_MAX_ATTEMPTS, DEFAULT_POLICY.maxAttempts),
    baseDelayMs: readPositiveInt(env.OPPTRIX_SCHEDULE_WEBHOOK_BASE_DELAY_MS, DEFAULT_POLICY.baseDelayMs),
    maxDelayMs: readPositiveInt(env.OPPTRIX_SCHEDULE_WEBHOOK_MAX_DELAY_MS, DEFAULT_POLICY.maxDelayMs),
    timeoutMs: readPositiveInt(env.OPPTRIX_SCHEDULE_WEBHOOK_TIMEOUT_MS, DEFAULT_POLICY.timeoutMs),
  }
}

/** 第 attempt 次失败后的等待（attempt 从 0 起；0 = 首次失败后） */
export function computeWebhookRetryDelayMs(
  attempt: number,
  policy: Pick<ScheduleWebhookRetryPolicy, 'baseDelayMs' | 'maxDelayMs'>,
  jitterRatio = 0.2,
): number {
  const exp = policy.baseDelayMs * (2 ** Math.max(0, attempt))
  const capped = Math.min(policy.maxDelayMs, exp)
  if (jitterRatio <= 0) return capped
  const jitter = capped * jitterRatio * (Math.random() * 2 - 1)
  return Math.max(0, Math.round(capped + jitter))
}

/** 解析 Retry-After（秒或 HTTP-date）为毫秒；无效则返回 null */
export function parseRetryAfterMs(header: string | null | undefined): number | null {
  if (!header?.trim()) return null
  const trimmed = header.trim()
  const seconds = Number.parseInt(trimmed, 10)
  if (Number.isFinite(seconds) && seconds >= 0) {
    return seconds * 1_000
  }
  const dateMs = Date.parse(trimmed)
  if (!Number.isNaN(dateMs)) {
    const delta = dateMs - Date.now()
    return delta > 0 ? delta : 0
  }
  return null
}

/** 是否应对该 HTTP 状态重试 */
export function isWebhookHttpStatusRetryable(status: number): boolean {
  if (status === 408 || status === 429) return true
  if (status >= 500 && status <= 599) return true
  return false
}

export function shouldRetryWebhookAttempt(
  attempt: number,
  policy: Pick<ScheduleWebhookRetryPolicy, 'maxAttempts'>,
): boolean {
  return attempt + 1 < policy.maxAttempts
}
