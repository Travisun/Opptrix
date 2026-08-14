/**
 * 同会话定时唤醒（进程内存 timer）。
 * 到期后新开一轮 agent.chat；活跃 chat 时延期，不 abort 当前轮。
 * 关进程后 timer 丢失，须在文档中说明。
 */
import { randomUUID } from 'node:crypto'

export const TURN_WAKE_MIN_SECONDS = 5
export const TURN_WAKE_MAX_SECONDS = 1800
export const TURN_WAKE_MAX_PER_SESSION = 8
export const TURN_WAKE_PROMPT_MAX_CHARS = 4000
/** 会话有活跃 chat 时延期再试（秒） */
export const TURN_WAKE_BUSY_DEFER_SECONDS = 10

export interface TurnWakeJob {
  id: string
  sessionId: string
  prompt: string
  seconds: number
  scheduledAt: string
  fireAt: string
  reason?: string
  /** 关联的异步任务 id（如 prepare_fuyao_dump / ensure_python 的 job_id） */
  jobId?: string
  model?: string
}

export type TurnWakeResumeHandler = (job: TurnWakeJob, wakeMessage: string) => Promise<void>

export interface TurnWakeRuntime {
  isSessionAlive: (sessionId: string) => boolean
  isChatBusy: (sessionId: string) => boolean
  now?: () => number
  setTimeout?: typeof setTimeout
  clearTimeout?: typeof clearTimeout
}

interface InternalEntry {
  job: TurnWakeJob
  timer: ReturnType<typeof setTimeout>
}

const byId = new Map<string, InternalEntry>()
const bySession = new Map<string, Set<string>>()

let resumeHandler: TurnWakeResumeHandler | null = null
let runtime: TurnWakeRuntime | null = null

export function setTurnWakeResumeHandler(handler: TurnWakeResumeHandler | null): void {
  resumeHandler = handler
}

export function configureTurnWakeRuntime(next: TurnWakeRuntime | null): void {
  runtime = next
}

export function clampWakeSeconds(raw: unknown): number {
  const n = typeof raw === 'number' ? raw : Number(raw)
  if (!Number.isFinite(n)) return TURN_WAKE_MIN_SECONDS
  return Math.min(TURN_WAKE_MAX_SECONDS, Math.max(TURN_WAKE_MIN_SECONDS, Math.floor(n)))
}

export function clampSuggestedWakeSeconds(etaSeconds: number | undefined | null): number {
  if (etaSeconds == null || !Number.isFinite(etaSeconds)) {
    return 60
  }
  return clampWakeSeconds(Math.ceil(etaSeconds))
}

/**
 * 由进度百分比 + 已用时间估算剩余秒数；无有效进度时用 heuristicDefault。
 */
export function estimateEtaFromProgress(opts: {
  percent?: number | null
  startedAtMs?: number | null
  nowMs?: number
  heuristicDefaultSeconds?: number
  bytesDownloaded?: number | null
  bytesTotal?: number | null
}): number {
  const now = opts.nowMs ?? Date.now()
  const started = opts.startedAtMs
  const elapsedSec =
    started != null && Number.isFinite(started) && started > 0
      ? Math.max(1, (now - started) / 1000)
      : null

  const bytesTotal = opts.bytesTotal
  const bytesDownloaded = opts.bytesDownloaded
  if (
    elapsedSec != null
    && bytesTotal != null
    && bytesTotal > 0
    && bytesDownloaded != null
    && bytesDownloaded > 0
    && bytesDownloaded < bytesTotal
  ) {
    const rate = bytesDownloaded / elapsedSec
    if (rate > 0) {
      const remaining = (bytesTotal - bytesDownloaded) / rate
      return Math.ceil(remaining * 1.15)
    }
  }

  const pct = opts.percent
  if (
    elapsedSec != null
    && pct != null
    && Number.isFinite(pct)
    && pct >= 5
    && pct < 99
  ) {
    const remaining = elapsedSec * (100 - pct) / pct
    return Math.ceil(remaining * 1.15)
  }

  return Math.max(TURN_WAKE_MIN_SECONDS, opts.heuristicDefaultSeconds ?? 60)
}

export function formatWakeMessage(job: TurnWakeJob, firedAtIso?: string): string {
  const lines = [
    '【定时唤醒】',
    '请根据下列回调继续执行（同会话自动续跑）：',
    '',
    job.prompt.trim(),
    '',
    '---',
    `wake_id: ${job.id}`,
    `scheduled_at: ${job.scheduledAt}`,
    `fire_at: ${job.fireAt}`,
    `delay_s: ${job.seconds}`,
  ]
  if (firedAtIso) lines.push(`fired_at: ${firedAtIso}`)
  if (job.reason?.trim()) lines.push(`reason: ${job.reason.trim()}`)
  if (job.jobId?.trim()) lines.push(`job_id: ${job.jobId.trim()}`)
  lines.push('说明: 先检查关联异步任务是否就绪，再继续原计划；勿 tight-poll。')
  return lines.join('\n')
}

function sessionSet(sessionId: string): Set<string> {
  let s = bySession.get(sessionId)
  if (!s) {
    s = new Set()
    bySession.set(sessionId, s)
  }
  return s
}

function removeEntry(id: string): void {
  const entry = byId.get(id)
  if (!entry) return
  const clear = runtime?.clearTimeout ?? clearTimeout
  clear(entry.timer)
  byId.delete(id)
  const set = bySession.get(entry.job.sessionId)
  if (set) {
    set.delete(id)
    if (set.size === 0) bySession.delete(entry.job.sessionId)
  }
}

function scheduleTimer(job: TurnWakeJob, delayMs: number): void {
  const setT = runtime?.setTimeout ?? setTimeout
  const timer = setT(() => {
    void onTimerFire(job.id)
  }, Math.max(0, delayMs))
  if (typeof timer === 'object' && timer !== null && 'unref' in timer) {
    try {
      ;(timer as { unref: () => void }).unref()
    } catch {
      /* ignore */
    }
  }
  byId.set(job.id, { job, timer })
  sessionSet(job.sessionId).add(job.id)
}

async function onTimerFire(id: string): Promise<void> {
  const entry = byId.get(id)
  if (!entry) return
  const { job } = entry
  // 从 map 移除但先不删 job 元数据；busy 时会重新挂
  byId.delete(id)
  const set = bySession.get(job.sessionId)
  if (set) {
    set.delete(id)
    if (set.size === 0) bySession.delete(job.sessionId)
  }

  const alive = runtime?.isSessionAlive(job.sessionId) ?? true
  if (!alive) return

  if (runtime?.isChatBusy(job.sessionId)) {
    const now = runtime.now?.() ?? Date.now()
    const deferMs = TURN_WAKE_BUSY_DEFER_SECONDS * 1000
    const deferred: TurnWakeJob = {
      ...job,
      fireAt: new Date(now + deferMs).toISOString(),
    }
    scheduleTimer(deferred, deferMs)
    return
  }

  const handler = resumeHandler
  if (!handler) {
    console.warn('[turn-wake] resume handler unset; drop wake', job.id)
    return
  }
  const wakeMessage = formatWakeMessage(job, new Date(runtime?.now?.() ?? Date.now()).toISOString())
  try {
    await handler(job, wakeMessage)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.warn(`[turn-wake] resume failed (${job.id}): ${msg}`)
  }
}

export function scheduleTurnWake(input: {
  sessionId: string
  prompt: string
  seconds: unknown
  reason?: string
  jobId?: string
  model?: string
}): { ok: true; wake_id: string; session_id: string; seconds: number; fire_at: string; scheduled_at: string; prompt: string; reason?: string; job_id?: string; note: string }
  | { ok: false; error: string } {
  const sessionId = String(input.sessionId ?? '').trim()
  if (!sessionId) return { ok: false, error: 'session_id 不可用（须在聊天会话中调用）' }

  if (runtime && !runtime.isSessionAlive(sessionId)) {
    return { ok: false, error: '会话不存在或已删除' }
  }

  const prompt = String(input.prompt ?? '').trim()
  if (!prompt) return { ok: false, error: 'prompt 必填（到期后注入的续跑说明）' }
  if (prompt.length > TURN_WAKE_PROMPT_MAX_CHARS) {
    return { ok: false, error: `prompt 过长（上限 ${TURN_WAKE_PROMPT_MAX_CHARS} 字）` }
  }

  const existing = bySession.get(sessionId)
  if (existing && existing.size >= TURN_WAKE_MAX_PER_SESSION) {
    return { ok: false, error: `本会话定时唤醒已达上限（${TURN_WAKE_MAX_PER_SESSION}）` }
  }

  const seconds = clampWakeSeconds(input.seconds)
  const now = runtime?.now?.() ?? Date.now()
  const scheduledAt = new Date(now).toISOString()
  const fireAt = new Date(now + seconds * 1000).toISOString()
  const reason = input.reason?.trim() || undefined
  const jobId = input.jobId?.trim() || undefined

  const job: TurnWakeJob = {
    id: randomUUID(),
    sessionId,
    prompt,
    seconds,
    scheduledAt,
    fireAt,
    reason,
    jobId,
    model: input.model?.trim() || undefined,
  }

  scheduleTimer(job, seconds * 1000)

  return {
    ok: true,
    wake_id: job.id,
    session_id: sessionId,
    seconds,
    fire_at: fireAt,
    scheduled_at: scheduledAt,
    prompt,
    ...(reason ? { reason } : {}),
    ...(jobId ? { job_id: jobId } : {}),
    note:
      '本轮可结束。到期后将在同会话自动注入续跑消息并新开一轮（交互模式）。定时器仅存进程内存，关闭应用会丢失。',
  }
}

export function cancelTurnWake(wakeId: string): boolean {
  const id = String(wakeId ?? '').trim()
  if (!id || !byId.has(id)) return false
  removeEntry(id)
  return true
}

export function clearSessionTurnWakes(sessionId: string): number {
  const id = String(sessionId ?? '').trim()
  const set = bySession.get(id)
  if (!set || set.size === 0) return 0
  const ids = [...set]
  for (const wakeId of ids) removeEntry(wakeId)
  return ids.length
}

export type PendingTurnWakeInfo = {
  wake_id: string
  fire_at: string
  reason?: string
  seconds_left: number
  seconds: number
}

/** 列出会话未到期唤醒（供 UI 恢复倒计时） */
export function listPendingTurnWakes(
  sessionId: string,
  nowMs?: number,
): PendingTurnWakeInfo[] {
  const id = String(sessionId ?? '').trim()
  if (!id) return []
  const set = bySession.get(id)
  if (!set || set.size === 0) return []
  const now = nowMs ?? runtime?.now?.() ?? Date.now()
  const out: PendingTurnWakeInfo[] = []
  for (const wakeId of set) {
    const entry = byId.get(wakeId)
    if (!entry) continue
    const fireMs = Date.parse(entry.job.fireAt)
    const secondsLeft = Number.isFinite(fireMs)
      ? Math.max(0, Math.ceil((fireMs - now) / 1000))
      : Math.max(0, entry.job.seconds)
    out.push({
      wake_id: entry.job.id,
      fire_at: entry.job.fireAt,
      ...(entry.job.reason ? { reason: entry.job.reason } : {}),
      seconds_left: secondsLeft,
      seconds: entry.job.seconds,
    })
  }
  return out.sort((a, b) => a.seconds_left - b.seconds_left)
}

/** 测试：当前挂起数量 */
export function listTurnWakeIdsForTests(sessionId?: string): string[] {
  if (sessionId) return [...(bySession.get(sessionId) ?? [])]
  return [...byId.keys()]
}

export function resetTurnWakeForTests(): void {
  for (const id of [...byId.keys()]) removeEntry(id)
  byId.clear()
  bySession.clear()
  resumeHandler = null
  runtime = null
}
