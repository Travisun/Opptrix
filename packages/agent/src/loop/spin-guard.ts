/** 反空转：同 fingerprint 成功/失败重复达阈值则短路，并注入 turn-tail 提示。 */

const SUCCESS_REPEAT_LIMIT = 3
const FAILURE_REPEAT_LIMIT = 2
const STALE_ROUNDS_WITHOUT_PROGRESS = 3
const ARGS_JSON_MAX = 480

export type SpinGuardBlock = {
  error: string
  spin_guard: true
  hint: string
}

type FingerprintStats = {
  success: number
  failure: number
}

type SessionSpinState = {
  byFingerprint: Map<string, FingerprintStats>
  /** 本轮是否出现过新 fingerprint（工具执行后标记） */
  seenFingerprints: Set<string>
  /** 连续无新 fingerprint 且 checklist 无进展的轮数 */
  staleRounds: number
  forceCloseHint: boolean
  lastBlockedHint: string | null
}

const sessions = new Map<string, SessionSpinState>()

function getOrCreate(sessionId: string): SessionSpinState {
  let state = sessions.get(sessionId)
  if (!state) {
    state = {
      byFingerprint: new Map(),
      seenFingerprints: new Set(),
      staleRounds: 0,
      forceCloseHint: false,
      lastBlockedHint: null,
    }
    sessions.set(sessionId, state)
  }
  return state
}

/** 稳定 key 序 + 截断，避免无关字段抖动。 */
export function fingerprintToolCall(
  toolName: string,
  args: Record<string, unknown>,
): string {
  const normalized = stableStringify(args)
  const clipped = normalized.length > ARGS_JSON_MAX
    ? `${normalized.slice(0, ARGS_JSON_MAX)}…`
    : normalized
  return `${toolName.trim()}::${clipped}`
}

function stableStringify(value: unknown): string {
  return JSON.stringify(sortKeys(value))
}

function sortKeys(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value
  if (Array.isArray(value)) return value.map(sortKeys)
  const obj = value as Record<string, unknown>
  const keys = Object.keys(obj).sort()
  const out: Record<string, unknown> = {}
  for (const key of keys) {
    out[key] = sortKeys(obj[key])
  }
  return out
}

function isFailureResult(result: unknown): boolean {
  if (result == null) return true
  if (typeof result !== 'object' || Array.isArray(result)) return false
  const rec = result as Record<string, unknown>
  if (typeof rec.error === 'string' && rec.error.trim()) return true
  if (rec.ok === false) return true
  if (rec.spin_guard === true) return true
  return false
}

/**
 * 若同 fingerprint 已达阈值，返回短路结果（不再打 broker）。
 * 否则返回 null，调用方应继续执行并在完成后 `recordSpinOutcome`。
 */
export function checkSpinGuard(
  sessionId: string,
  toolName: string,
  args: Record<string, unknown>,
): SpinGuardBlock | null {
  const fp = fingerprintToolCall(toolName, args)
  const state = getOrCreate(sessionId)
  const stats = state.byFingerprint.get(fp)
  if (!stats) return null

  if (stats.success >= SUCCESS_REPEAT_LIMIT) {
    const hint = '同一查询已重复多次且结果无新意。请换数据源或角度，或开始整理成稿，勿继续空转。'
    state.lastBlockedHint = hint
    return {
      error: '已拦截重复调用',
      spin_guard: true,
      hint,
    }
  }
  if (stats.failure >= FAILURE_REPEAT_LIMIT) {
    const hint = '同一操作连续失败。请更换路径、说明缺口，或开始基于已有材料成稿。'
    state.lastBlockedHint = hint
    return {
      error: '已拦截重复失败调用',
      spin_guard: true,
      hint,
    }
  }
  return null
}

export function recordSpinOutcome(
  sessionId: string,
  toolName: string,
  args: Record<string, unknown>,
  result: unknown,
): void {
  const fp = fingerprintToolCall(toolName, args)
  const state = getOrCreate(sessionId)
  const wasNew = !state.seenFingerprints.has(fp)
  state.seenFingerprints.add(fp)
  if (wasNew) {
    // 新证据路径出现 → 重置空转轮计数（本轮结束时再评估）
    state.forceCloseHint = false
  }
  const stats = state.byFingerprint.get(fp) ?? { success: 0, failure: 0 }
  if (isFailureResult(result)) stats.failure += 1
  else stats.success += 1
  state.byFingerprint.set(fp, stats)
}

/**
 * 每 LLM 工具轮结束后调用：若本轮无新 fingerprint 且 checklist 无进展，累计空转轮。
 * @returns 是否应注入强制收口 turn-tail
 */
export function noteRoundProgress(
  sessionId: string,
  opts: { hadNewFingerprint: boolean; checklistProgressed: boolean },
): boolean {
  const state = getOrCreate(sessionId)
  if (opts.hadNewFingerprint || opts.checklistProgressed) {
    state.staleRounds = 0
    state.forceCloseHint = false
    return false
  }
  state.staleRounds += 1
  if (state.staleRounds >= STALE_ROUNDS_WITHOUT_PROGRESS) {
    state.forceCloseHint = true
    return true
  }
  return state.forceCloseHint
}

/** 一轮工具执行开始前调用，用于区分「本轮新 fingerprint」。 */
export function beginSpinRound(sessionId: string): Set<string> {
  const state = getOrCreate(sessionId)
  return new Set(state.seenFingerprints)
}

export function roundHadNewFingerprint(
  sessionId: string,
  fingerprintsBefore: ReadonlySet<string>,
): boolean {
  const state = getOrCreate(sessionId)
  for (const fp of state.seenFingerprints) {
    if (!fingerprintsBefore.has(fp)) return true
  }
  return false
}

export function buildSpinGuardTurnTail(sessionId: string): string {
  const state = sessions.get(sessionId)
  if (!state) return ''
  const parts: string[] = []
  if (state.lastBlockedHint) {
    parts.push(`【路径提醒】${state.lastBlockedHint}`)
    state.lastBlockedHint = null
  }
  if (state.forceCloseHint) {
    parts.push(
      '【收口提醒】连续多轮没有新的取证路径，也没有推进研究步骤。请基于已有材料整理结论；缺证据处如实说明缺口，不要继续重复同一查询。',
    )
  }
  return parts.join('\n')
}

export function clearSpinGuardSession(sessionId: string): void {
  sessions.delete(sessionId)
}

/** 测试钩子 */
export function resetSpinGuardForTests(): void {
  sessions.clear()
}

export const SPIN_GUARD_LIMITS = {
  SUCCESS_REPEAT_LIMIT,
  FAILURE_REPEAT_LIMIT,
  STALE_ROUNDS_WITHOUT_PROGRESS,
} as const
