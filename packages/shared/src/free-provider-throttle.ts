/**
 * 免费行情源硬性限流冷却 — 阶梯退避时长与触发判定（纯函数，无 I/O）。
 *
 * 阶梯（escalationLevel 从 1 起）：
 * 1→5min, 2→10min, 3→30min, 4→1h, 5→2h, 6→3h,
 * 7+→3h+(n×6h) 直至 24h，之后每次 +6h。
 */

const MIN = 60_000
const HOUR = 60 * MIN

/** 前 6 级固定冷却（毫秒） */
export const FREE_PROVIDER_THROTTLE_FIXED_MS = [
  5 * MIN,
  10 * MIN,
  30 * MIN,
  1 * HOUR,
  2 * HOUR,
  3 * HOUR,
] as const

export const FREE_PROVIDER_THROTTLE_MAX_MS = 24 * HOUR
export const FREE_PROVIDER_THROTTLE_STEP_MS = 6 * HOUR

export interface FreeProviderThrottleState {
  providerId: string
  escalationLevel: number
  cooldownUntil: number
  lastError: string
  lastTriggeredAt: number
  updatedAt: number
}

export type FreeProviderThrottleLogEvent = 'trigger' | 'success' | 'reset'

export interface FreeProviderThrottleLogEntry {
  id?: number
  providerId: string
  event: FreeProviderThrottleLogEvent
  detail: string
  escalationLevel: number
  cooldownUntil: number
  createdAt: number
}

/** 根据当前升级级别计算本次冷却时长 */
export function freeProviderThrottleCooldownMs(escalationLevel: number): number {
  if (escalationLevel <= 0) return 0
  if (escalationLevel <= FREE_PROVIDER_THROTTLE_FIXED_MS.length) {
    return FREE_PROVIDER_THROTTLE_FIXED_MS[escalationLevel - 1]!
  }

  const extra = escalationLevel - FREE_PROVIDER_THROTTLE_FIXED_MS.length
  const linear = 3 * HOUR + extra * FREE_PROVIDER_THROTTLE_STEP_MS
  if (linear <= FREE_PROVIDER_THROTTLE_MAX_MS) return linear

  const levelsUntil24 = Math.ceil(
    (FREE_PROVIDER_THROTTLE_MAX_MS - 3 * HOUR) / FREE_PROVIDER_THROTTLE_STEP_MS,
  )
  const levelAtFirst24 = FREE_PROVIDER_THROTTLE_FIXED_MS.length + levelsUntil24
  if (escalationLevel <= levelAtFirst24) return FREE_PROVIDER_THROTTLE_MAX_MS
  return FREE_PROVIDER_THROTTLE_MAX_MS
    + (escalationLevel - levelAtFirst24) * FREE_PROVIDER_THROTTLE_STEP_MS
}

function httpStatusTriggersThrottle(status: number): boolean {
  return status === 400 || status === 403 || status === 429 || status >= 500
}

const THROTTLE_TEXT = /permission\s*denied|无权限|权限不足|访问被拒绝|请求过于频繁|限流|封禁|封ip|too\s+many|rate\s*limit|forbidden|denied/i

/** HTTP 层空响应体（与业务层「无数据行」区分） */
export const FREE_PROVIDER_EMPTY_BODY_REASON = 'empty_response_body'

export function isEmptyHttpResponseBody(body: string): boolean {
  return !body.trim()
}

/**
 * 判定是否应触发免费源冷却（HTTP 4xx/5xx、denied 文案、空响应体等）。
 * 不含业务层空结果（如无 K 线、无公告）——那类应走软失败/换源，不进入长冷却。
 */
export function isFreeProviderThrottleTrigger(
  error: unknown,
  options?: { emptyBody?: boolean },
): { trigger: boolean; reason: string } {
  if (options?.emptyBody) {
    return { trigger: true, reason: FREE_PROVIDER_EMPTY_BODY_REASON }
  }

  if (typeof error === 'object' && error !== null && 'status' in error) {
    const status = Number((error as { status: unknown }).status)
    if (Number.isFinite(status) && httpStatusTriggersThrottle(status)) {
      return { trigger: true, reason: `http_${status}` }
    }
  }

  const msg = error instanceof Error ? error.message : String(error ?? '')
  if (!msg.trim()) {
    return { trigger: false, reason: '' }
  }

  if (msg === FREE_PROVIDER_EMPTY_BODY_REASON || /^empty_response_body$/i.test(msg)) {
    return { trigger: true, reason: FREE_PROVIDER_EMPTY_BODY_REASON }
  }

  const httpMatch = msg.match(/\bHTTP\s+(\d{3})\b/i)
  if (httpMatch) {
    const status = Number(httpMatch[1])
    if (httpStatusTriggersThrottle(status)) {
      return { trigger: true, reason: `http_${status}` }
    }
  }

  if (/\b(400|403|429|50[0-9])\b/.test(msg) && /http|status|错误|失败|异常/i.test(msg)) {
    return { trigger: true, reason: msg.slice(0, 120) }
  }

  if (THROTTLE_TEXT.test(msg)) {
    return { trigger: true, reason: msg.slice(0, 120) }
  }

  return { trigger: false, reason: '' }
}

export function formatFreeProviderThrottleWait(remainingMs: number): string {
  const sec = Math.max(0, Math.ceil(remainingMs / 1000))
  if (sec < 60) return `${sec}秒`
  if (sec < 3600) return `${Math.ceil(sec / 60)}分钟`
  return `${(sec / 3600).toFixed(1)}小时`
}
