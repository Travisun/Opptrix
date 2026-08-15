/**
 * schedule_turn_wake 倒计时：从工具结果 / pending-wakes API 解析 + 秒级文案。
 */

export type PendingWakeInfo = {
  wakeId: string
  fireAt: string
  seconds: number
  reason?: string
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/** 与服务端 formatWakeSecondsLabel 同口径 */
export function formatWakeCountdownLabel(secondsLeft: number): string {
  const s = Math.max(0, Math.floor(secondsLeft))
  if (s < 60) return `约 ${s} 秒后继续检查`
  const m = Math.floor(s / 60)
  const r = s % 60
  if (r === 0) return `约 ${m} 分后继续检查`
  return `约 ${m} 分 ${r} 秒后继续检查`
}

export function secondsLeftUntil(fireAtIso: string, nowMs = Date.now()): number {
  const fireMs = Date.parse(fireAtIso)
  if (!Number.isFinite(fireMs)) return 0
  return Math.max(0, Math.ceil((fireMs - nowMs) / 1000))
}

function parseSecondsField(raw: unknown): number | null {
  const n = typeof raw === 'number' ? raw : Number(raw)
  if (!Number.isFinite(n) || n <= 0) return null
  return Math.floor(n)
}

function parseWakePayload(raw: unknown): PendingWakeInfo | null {
  if (!isRecord(raw) || raw.ok === false) return null
  const fireAt = typeof raw.fire_at === 'string' ? raw.fire_at.trim() : ''
  const wakeId = typeof raw.wake_id === 'string' ? raw.wake_id.trim() : ''
  if (!fireAt || !wakeId) return null
  const seconds = parseSecondsField(raw.seconds)
  const reason = typeof raw.reason === 'string' && raw.reason.trim()
    ? raw.reason.trim()
    : undefined
  return {
    wakeId,
    fireAt,
    seconds: seconds ?? secondsLeftUntil(fireAt),
    ...(reason ? { reason } : {}),
  }
}

/** 从工具步骤 resultDetail / resultPreview 解析 schedule_turn_wake 结果 */
export function parseScheduleTurnWakeFromStep(step: {
  tool?: string
  resultDetail?: string
  resultPreview?: string
}): PendingWakeInfo | null {
  if (step.tool !== 'schedule_turn_wake') return null
  for (const text of [step.resultDetail, step.resultPreview]) {
    if (!text?.trim()) continue
    try {
      const parsed = JSON.parse(text) as unknown
      const wake = parseWakePayload(parsed)
      if (wake) return wake
    } catch {
      /* try next */
    }
  }
  return null
}

/** 解析 GET pending-wakes 响应 */
export function parsePendingWakesApi(payload: unknown): PendingWakeInfo[] {
  if (!isRecord(payload) || !Array.isArray(payload.wakes)) return []
  const out: PendingWakeInfo[] = []
  for (const item of payload.wakes) {
    if (!isRecord(item)) continue
    const wakeId = typeof item.wake_id === 'string' ? item.wake_id.trim() : ''
    const fireAt = typeof item.fire_at === 'string' ? item.fire_at.trim() : ''
    if (!wakeId || !fireAt) continue
    const secondsLeft = typeof item.seconds_left === 'number'
      ? item.seconds_left
      : Number(item.seconds_left)
    const seconds = parseSecondsField(item.seconds)
    const reason = typeof item.reason === 'string' && item.reason.trim()
      ? item.reason.trim()
      : undefined
    out.push({
      wakeId,
      fireAt,
      seconds: seconds
        ?? (Number.isFinite(secondsLeft) ? Math.max(0, Math.floor(secondsLeft)) : secondsLeftUntil(fireAt)),
      ...(reason ? { reason } : {}),
    })
  }
  return out.sort((a, b) => Date.parse(a.fireAt) - Date.parse(b.fireAt))
}

/**
 * 到期后单次 fetch pending-wakes 的决策：有未来 wake 则重启倒计时，否则等 live progress。
 */
export function decideAfterWakeExpiryFetch(
  wakes: PendingWakeInfo[],
  nowMs = Date.now(),
): { kind: 'restart'; wake: PendingWakeInfo } | { kind: 'await_progress' } {
  const next = wakes[0]
  if (next && secondsLeftUntil(next.fireAt, nowMs) > 0) {
    return { kind: 'restart', wake: next }
  }
  return { kind: 'await_progress' }
}
