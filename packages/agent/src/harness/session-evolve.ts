/**
 * 主会话回合成功结束后：异步跑 Self-Harness lab（promote:'auto'）。
 * 禁止阻塞 chat；禁止改写当前回合 system/tools 冻结。
 */

import type { SessionRecord } from '../sessions.js'
import { getResearchChecklist } from '../loop/research-checklist.js'
import {
  buildWeaknessReport,
  type BuildWeaknessReportInput,
  type WeaknessReportTurn,
} from './weakness-report.js'
import { runHarnessLab, type RunHarnessLabResult } from './lab.js'
import {
  appendHarnessAudit,
  isHarnessAutoPromoteEnabled,
  normalizeHarnessModelRef,
} from './local-store.js'

/** 同 session 成功 promote 后的冷却（毫秒） */
export const HARNESS_EVOLVE_SESSION_COOLDOWN_MS = 4 * 60 * 1000

/** 每个 session 进程内最多成功 promote 次数 */
const MAX_SUCCESS_PROMOTE_PER_SESSION = 1

type SessionEvolveState = {
  /** 上次成功 promote 时刻 */
  lastPromoteAt: number
  /** 上次实际跑 lab 时刻（含未 promote） */
  lastAttemptAt: number
  promoteCount: number
}

const sessionState = new Map<string, SessionEvolveState>()

export type ScheduleHarnessEvolveOpts = {
  /** 会话旁路已激活技能；缺省时由 lab 侧启发式推断 */
  activatedSkills?: readonly string[]
  /** 协作子会话：显式 skip */
  isSubSession?: boolean
}

export type EvolveHarnessSkipResult = {
  skipped: true
  reason: string
}

export type EvolveHarnessResult = RunHarnessLabResult | EvolveHarnessSkipResult

function mapTurns(record: SessionRecord): WeaknessReportTurn[] {
  const turns = record.turns ?? []
  return turns.map(t => ({
    role: t.role,
    content: typeof t.content === 'string' ? t.content : '',
    toolsUsed: t.toolsUsed,
    toolSteps: t.toolSteps,
    at: t.at,
  }))
}

function buildReportInput(
  sessionId: string,
  record: SessionRecord,
  opts?: ScheduleHarnessEvolveOpts,
): BuildWeaknessReportInput {
  const modelRef = normalizeHarnessModelRef(record.model) ?? record.model ?? undefined
  const checklist = getResearchChecklist(sessionId)
  const input: BuildWeaknessReportInput = {
    sessionId,
    modelRef: modelRef || undefined,
    turns: mapTurns(record),
  }
  if (checklist.length) input.checklist = checklist
  if (opts?.activatedSkills?.length) {
    input.activatedSkills = opts.activatedSkills
  }
  return input
}

function auditSkip(detail: string, modelRef?: string | null): void {
  try {
    appendHarnessAudit({
      action: 'skip_auto_promote',
      detail,
      ...(modelRef ? { modelRef } : {}),
    })
  } catch {
    /* audit 失败不影响 chat */
  }
}

function isCollaborationChildSession(record: SessionRecord, opts?: ScheduleHarnessEvolveOpts): boolean {
  if (opts?.isSubSession) return true
  if (record.kind === 'subagent') return true
  if (record.parentSessionId) return true
  return false
}

/**
 * 同步执行进化（测试钩 / setImmediate 回调）。失败吞掉并 audit。
 */
export function evolveHarnessFromSessionSyncForTests(
  sessionId: string,
  getSession: () => SessionRecord | null | undefined,
  opts?: ScheduleHarnessEvolveOpts,
): EvolveHarnessResult {
  const id = sessionId.trim()
  if (!id) {
    return { skipped: true, reason: 'no_session' }
  }

  let record: SessionRecord | null | undefined
  try {
    record = getSession()
  } catch {
    auditSkip('evolve_error')
    return { skipped: true, reason: 'evolve_error' }
  }

  if (!record) {
    return { skipped: true, reason: 'no_session' }
  }

  if (isCollaborationChildSession(record, opts)) {
    auditSkip('sub_session', normalizeHarnessModelRef(record.model) ?? record.model)
    return { skipped: true, reason: 'sub_session' }
  }

  const modelBucket =
    normalizeHarnessModelRef(record.model)
    ?? (typeof record.model === 'string' && record.model.trim() ? record.model.trim() : undefined)

  if (!isHarnessAutoPromoteEnabled()) {
    auditSkip('auto_promote_disabled', modelBucket)
    return { skipped: true, reason: 'auto_promote_disabled' }
  }

  const state = sessionState.get(id)
  const now = Date.now()
  if (state) {
    if (state.promoteCount >= MAX_SUCCESS_PROMOTE_PER_SESSION) {
      auditSkip('cooldown', modelBucket)
      return { skipped: true, reason: 'cooldown' }
    }
    const anchor = Math.max(state.lastPromoteAt, state.lastAttemptAt)
    if (anchor > 0 && now - anchor < HARNESS_EVOLVE_SESSION_COOLDOWN_MS) {
      auditSkip('cooldown', modelBucket)
      return { skipped: true, reason: 'cooldown' }
    }
  }

  let reportInput: BuildWeaknessReportInput
  try {
    reportInput = buildReportInput(id, record, opts)
  } catch {
    auditSkip('evolve_error', modelBucket)
    return { skipped: true, reason: 'evolve_error' }
  }

  let weaknessCount = 0
  try {
    weaknessCount = buildWeaknessReport(reportInput).totals.weaknessCount
  } catch {
    auditSkip('evolve_error', modelBucket)
    return { skipped: true, reason: 'evolve_error' }
  }

  if (weaknessCount === 0) {
    auditSkip('no_weakness', modelBucket)
    return { skipped: true, reason: 'no_weakness' }
  }

  try {
    const result = runHarnessLab({
      reportInput,
      promote: 'auto',
      modelBucket,
    })
    const next: SessionEvolveState = {
      lastAttemptAt: Date.now(),
      lastPromoteAt: state?.lastPromoteAt ?? 0,
      promoteCount: state?.promoteCount ?? 0,
    }
    if (result.promoted) {
      next.lastPromoteAt = next.lastAttemptAt
      next.promoteCount += 1
    }
    sessionState.set(id, next)
    return result
  } catch {
    auditSkip('evolve_error', modelBucket)
    return { skipped: true, reason: 'evolve_error' }
  }
}

/**
 * 回合成功收尾后调度：不进入当前 chat 调用栈同步执行 lab。
 */
export function scheduleHarnessEvolveAfterTurn(
  sessionId: string,
  getSession: () => SessionRecord | null | undefined,
  opts?: ScheduleHarnessEvolveOpts,
): void {
  const run = () => {
    try {
      evolveHarnessFromSessionSyncForTests(sessionId, getSession, opts)
    } catch {
      try {
        appendHarnessAudit({ action: 'skip_auto_promote', detail: 'evolve_error' })
      } catch {
        /* swallow */
      }
    }
  }

  if (typeof setImmediate === 'function') {
    setImmediate(run)
  } else {
    queueMicrotask(run)
  }
}

/** 测试：清空 session 冷却状态 */
export function resetHarnessSessionEvolveForTests(): void {
  sessionState.clear()
}
