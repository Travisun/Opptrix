/** 反空转：同 fingerprint 成功/失败重复达阈值则短路，并注入 turn-tail 提示。 */

import { isAgentCursorSmoothEnabled } from './budget.js'

const SMOOTH_LIMITS = {
  SUCCESS_REPEAT_LIMIT: 5,
  FAILURE_REPEAT_LIMIT: 3,
  STALE_ROUNDS_WITHOUT_PROGRESS: 8,
  POLL_IN_FLIGHT_HARD_LIMIT: 64,
} as const

const LEGACY_LIMITS = {
  SUCCESS_REPEAT_LIMIT: 3,
  FAILURE_REPEAT_LIMIT: 2,
  STALE_ROUNDS_WITHOUT_PROGRESS: 3,
  POLL_IN_FLIGHT_HARD_LIMIT: 48,
} as const

function resolveLimits() {
  return isAgentCursorSmoothEnabled() ? SMOOTH_LIMITS : LEGACY_LIMITS
}

const ARGS_JSON_MAX = 480

/** 异步 job 轮询工具：preparing/installing 等不计入 success/failure 重复 */
export const SPIN_POLL_TOOLS = new Set([
  'ensure_python',
  'prepare_fuyao_dump',
])

/**
 * 协作任务 list/get：进行中轮询计入 pollInFlight（硬限更紧）；
 * 终态成功仍走 success 重复上限，禁止无限放行同一 fingerprint。
 */
export const SPIN_SUBAGENT_POLL_TOOLS = new Set([
  'list_subagents',
  'get_subagent',
])

/**
 * 委派类工具：不参与 success/failure 重复硬拦。
 * 多角色研讨常需在 schema 失败 / 子任务未成功后立刻再 run_subagent；
 * 用通用「重复失败」短路会误伤高可用重试。
 * list/get 仍走 SPIN_SUBAGENT_POLL_TOOLS 的进行中轮询限。
 */
export const SPIN_SUBAGENT_DELEGATE_TOOLS = new Set([
  'run_subagent',
  'cancel_subagent',
  'reclaim_subagent',
])

/**
 * 控制面工具：不参与 success/failure 重复硬拦。
 * 取消任务、会话密钥/LAN 授权等需允许失败后立刻重试，勿被通用空转短路误伤。
 */
export const SPIN_CONTROL_EXEMPT_TOOLS = new Set([
  'cancel_job',
  'grant_session_secret',
  'revoke_session_secret',
  'request_session_lan_access',
  'request_secret',
])

/**
 * 后台 job list：进行中轮询计入 pollInFlight（硬限与协作 list/get 同值）；
 * 终态/空列表仍走 success 重复上限，禁止无限放行同一 fingerprint。
 */
export const SPIN_JOB_POLL_TOOLS = new Set(['list_jobs'])

/** 协作任务 / list_jobs 进行中轮询硬限（低于通用 ensure_python poll） */
export const SUBAGENT_POLL_IN_FLIGHT_HARD_LIMIT = 24

/** list_subagents 无参查询（创建前核对）单独更高限 */
export const SUBAGENT_LIST_EMPTY_ARGS_POLL_LIMIT = 36

function resolveSubagentPollHardLimit(
  toolName: string,
  args: Record<string, unknown>,
): number {
  if (toolName.trim() === 'list_subagents' && Object.keys(args).length === 0) {
    return SUBAGENT_LIST_EMPTY_ARGS_POLL_LIMIT
  }
  return SUBAGENT_POLL_IN_FLIGHT_HARD_LIMIT
}

/**
 * 成功挂起/定时续跑：不计入 success 重复、不推进 stale。
 * 失败结果仍计 failure。不进入 pollInFlight。
 */
export const SPIN_WAKE_SUCCESS_PROGRESS_TOOLS = new Set([
  'schedule_turn_wake',
])

const IN_PROGRESS_JOB_STATUSES = new Set([
  'preparing',
  'installing',
  'running',
  'pending',
])

const IN_PROGRESS_SUBAGENT_STATUSES = new Set([
  'queued',
  'running',
])

const IN_PROGRESS_LIST_JOB_STATUSES = new Set([
  'queued',
  'accepted',
  'preparing',
  'running',
])

export function isSpinPollTool(toolName: string): boolean {
  return SPIN_POLL_TOOLS.has(toolName.trim())
}

export function isSpinSubagentPollTool(toolName: string): boolean {
  return SPIN_SUBAGENT_POLL_TOOLS.has(toolName.trim())
}

export function isSpinSubagentDelegateTool(toolName: string): boolean {
  return SPIN_SUBAGENT_DELEGATE_TOOLS.has(toolName.trim())
}

export function isSpinControlExemptTool(toolName: string): boolean {
  return SPIN_CONTROL_EXEMPT_TOOLS.has(toolName.trim())
}

/** 委派 + 控制面：永不因 success/failure 重复短路 */
export function isSpinExemptFromRepeat(toolName: string): boolean {
  return isSpinSubagentDelegateTool(toolName) || isSpinControlExemptTool(toolName)
}

export function isSpinJobPollTool(toolName: string): boolean {
  return SPIN_JOB_POLL_TOOLS.has(toolName.trim())
}

export function isSpinWakeSuccessProgressTool(toolName: string): boolean {
  return SPIN_WAKE_SUCCESS_PROGRESS_TOOLS.has(toolName.trim())
}

/** 从 result.status 判断是否为进行中（大小写不敏感，trim） */
export function isInProgressJobStatus(result: unknown): boolean {
  if (result == null || typeof result !== 'object' || Array.isArray(result)) return false
  const status = (result as Record<string, unknown>).status
  if (typeof status !== 'string') return false
  return IN_PROGRESS_JOB_STATUSES.has(status.trim().toLowerCase())
}

/** get_subagent / list_subagents 返回是否仍含进行中任务 */
export function isInProgressSubagentPollResult(toolName: string, result: unknown): boolean {
  const name = toolName.trim()
  if (!isSpinSubagentPollTool(name)) return false
  if (result == null || typeof result !== 'object' || Array.isArray(result)) return false
  const rec = result as Record<string, unknown>
  if (name === 'get_subagent') {
    const status = rec.status
    if (typeof status !== 'string') return false
    return IN_PROGRESS_SUBAGENT_STATUSES.has(status.trim().toLowerCase())
  }
  // list_subagents：{ runs: [...] }
  const runs = rec.runs
  if (!Array.isArray(runs)) return false
  return runs.some((item) => {
    if (item == null || typeof item !== 'object' || Array.isArray(item)) return false
    const status = (item as Record<string, unknown>).status
    if (typeof status !== 'string') return false
    return IN_PROGRESS_SUBAGENT_STATUSES.has(status.trim().toLowerCase())
  })
}

/** list_jobs：{ jobs: [{ state }] } 中任一条仍为进行中 */
export function isInProgressListJobsResult(result: unknown): boolean {
  if (result == null || typeof result !== 'object' || Array.isArray(result)) return false
  const jobs = (result as Record<string, unknown>).jobs
  if (!Array.isArray(jobs)) return false
  return jobs.some((item) => {
    if (item == null || typeof item !== 'object' || Array.isArray(item)) return false
    const state = (item as Record<string, unknown>).state
    if (typeof state !== 'string') return false
    return IN_PROGRESS_LIST_JOB_STATUSES.has(state.trim().toLowerCase())
  })
}

export type SpinGuardBlock = {
  error: string
  spin_guard: true
  hint: string
}

type FingerprintStats = {
  success: number
  failure: number
  /** 白名单工具进行中轮询次数（不计入 success/failure） */
  pollInFlight: number
}

type SessionSpinState = {
  byFingerprint: Map<string, FingerprintStats>
  /** 本轮是否出现过新 fingerprint（工具执行后标记） */
  seenFingerprints: Set<string>
  /** 连续无新 fingerprint 且 checklist 无进展的轮数 */
  staleRounds: number
  forceCloseHint: boolean
  lastBlockedHint: string | null
  /** 本轮是否有白名单进行中轮询 / 成功 wake（视为有进展） */
  pollProgressThisRound: boolean
}

const sessions = new Map<string, SessionSpinState>()

function emptyStats(): FingerprintStats {
  return { success: 0, failure: 0, pollInFlight: 0 }
}

function getOrCreate(sessionId: string): SessionSpinState {
  let state = sessions.get(sessionId)
  if (!state) {
    state = {
      byFingerprint: new Map(),
      seenFingerprints: new Set(),
      staleRounds: 0,
      forceCloseHint: false,
      lastBlockedHint: null,
      pollProgressThisRound: false,
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

  const limits = resolveLimits()

  if (
    (isSpinSubagentPollTool(toolName) || isSpinJobPollTool(toolName)) &&
    stats.pollInFlight >= (
      isSpinSubagentPollTool(toolName)
        ? resolveSubagentPollHardLimit(toolName, args)
        : SUBAGENT_POLL_IN_FLIGHT_HARD_LIMIT
    )
  ) {
    const hint = isSpinJobPollTool(toolName)
      ? '已多次查询仍在进行中的后台任务。请停止 list_jobs 忙等轮询；等待终态自动续跑，或仅在需要时 cancel_job。'
      : '已多次查询仍在进行中的协作任务。请勿 sleep/忙等轮询；等待终态自动续跑。创建前可用 list_subagents 核对一次；需要完整结果时调用一次 get_subagent。失败优先 run_subagent(restart_run_id=…)。'
    state.lastBlockedHint = hint
    return {
      error: isSpinJobPollTool(toolName) ? '已拦截后台任务轮询' : '已拦截协作任务轮询',
      spin_guard: true,
      hint,
    }
  }

  if (isSpinPollTool(toolName) && stats.pollInFlight >= limits.POLL_IN_FLIGHT_HARD_LIMIT) {
    const hint =
      '同一任务轮询次数过多，可能已卡住。请换路径、说明进度异常，或基于已有材料继续，勿无限等待。'
    state.lastBlockedHint = hint
    return {
      error: '已拦截过久轮询',
      spin_guard: true,
      hint,
    }
  }

  // 委派 / 控制面：永不因 success/failure 重复短路
  if (isSpinExemptFromRepeat(toolName)) {
    return null
  }

  // 成功 wake 工具不走 success 重复拦截
  const skipSuccessRepeat = isSpinWakeSuccessProgressTool(toolName)

  if (!skipSuccessRepeat && stats.success >= limits.SUCCESS_REPEAT_LIMIT) {
    const hint = spinRepeatHint(toolName, 'success')
    state.lastBlockedHint = hint
    return {
      error: '已拦截重复调用',
      spin_guard: true,
      hint,
    }
  }
  if (stats.failure >= limits.FAILURE_REPEAT_LIMIT) {
    const hint = spinRepeatHint(toolName, 'failure')
    state.lastBlockedHint = hint
    return {
      error: '已拦截重复失败调用',
      spin_guard: true,
      hint,
    }
  }
  return null
}

function spinRepeatHint(toolName: string, kind: 'success' | 'failure'): string {
  const name = toolName.trim()
  if (name === 'list_workspace_grants') {
    return kind === 'success'
      ? 'list_workspace_grants 已重复多次。勿对同一 root 反复 list；用已有 root_id + 相对 path 继续读/写/跑，或向用户说明缺口。'
      : '列出工作区授权连续失败。请改相对路径或向用户说明，勿换 root 乱试、勿同模式空转 list。'
  }
  if (name === 'opptrix_run') {
    return kind === 'success'
      ? '同一 opptrix_run 已重复多次且无新意。请推进下一步或向用户说明结果，勿同命令空转。'
      : 'opptrix_run 连续同类失败。若报绝对路径：立刻改相对 root_id 的 cwd/path 重试；否则改 command/策略或向用户说明，勿同模式空转。'
  }
  return kind === 'success'
    ? '同一查询已重复多次且结果无新意。请换数据源或角度，或开始整理成稿，勿继续空转。'
    : '同一操作连续失败。请更换路径、说明缺口，或开始基于已有材料成稿。'
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
  const stats = state.byFingerprint.get(fp) ?? emptyStats()

  if (isSpinWakeSuccessProgressTool(toolName) && !isFailureResult(result)) {
    // 成功挂起 = 合法收口本轮，不推进 stale、不计 success 重复
    state.pollProgressThisRound = true
    state.byFingerprint.set(fp, stats)
    return
  }

  if (isSpinSubagentPollTool(toolName) && isInProgressSubagentPollResult(toolName, result)) {
    stats.pollInFlight += 1
    state.pollProgressThisRound = true
    state.byFingerprint.set(fp, stats)
    return
  }

  if (isSpinJobPollTool(toolName) && isInProgressListJobsResult(result)) {
    stats.pollInFlight += 1
    state.pollProgressThisRound = true
    state.byFingerprint.set(fp, stats)
    return
  }

  if (isSpinPollTool(toolName) && isInProgressJobStatus(result)) {
    stats.pollInFlight += 1
    state.pollProgressThisRound = true
    state.byFingerprint.set(fp, stats)
    return
  }

  // 委派 / 控制面：记 fingerprint 视为有进展，但不累计 success/failure（避免误伤重试）
  if (isSpinExemptFromRepeat(toolName)) {
    state.pollProgressThisRound = true
    state.byFingerprint.set(fp, stats)
    return
  }

  if (isFailureResult(result)) stats.failure += 1
  else stats.success += 1
  state.byFingerprint.set(fp, stats)
}

/**
 * 每 LLM 工具轮结束后调用：若本轮无新 fingerprint 且 checklist 无进展，累计空转轮。
 * 白名单进行中轮询 / 成功 wake（pollProgressThisRound）视为有进展。
 * @returns 是否应注入强制收口 turn-tail
 */
export function noteRoundProgress(
  sessionId: string,
  opts: { hadNewFingerprint: boolean; checklistProgressed: boolean },
): boolean {
  const state = getOrCreate(sessionId)
  const pollProgress = state.pollProgressThisRound
  state.pollProgressThisRound = false
  if (opts.hadNewFingerprint || opts.checklistProgressed || pollProgress) {
    state.staleRounds = 0
    state.forceCloseHint = false
    return false
  }
  state.staleRounds += 1
  const staleLimit = resolveLimits().STALE_ROUNDS_WITHOUT_PROGRESS
  if (state.staleRounds >= staleLimit) {
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

/** 运行时阈值（随 OPPTRIX_AGENT_CURSOR_SMOOTH 变化） */
export const SPIN_GUARD_LIMITS = {
  get SUCCESS_REPEAT_LIMIT() {
    return resolveLimits().SUCCESS_REPEAT_LIMIT
  },
  get FAILURE_REPEAT_LIMIT() {
    return resolveLimits().FAILURE_REPEAT_LIMIT
  },
  get STALE_ROUNDS_WITHOUT_PROGRESS() {
    return resolveLimits().STALE_ROUNDS_WITHOUT_PROGRESS
  },
  get POLL_IN_FLIGHT_HARD_LIMIT() {
    return resolveLimits().POLL_IN_FLIGHT_HARD_LIMIT
  },
} as const
