/**
 * 父会话协作任务条：由 SSE progress / list API 维护。
 * 用户文案用「协作任务」，勿暴露 subagent。
 */

import type { ChatProgressEvent } from '../types/chatProgress'
import type { SessionCollaborationTaskDto } from '../api/client'

export type CollaborationTaskStatus =
  | 'queued'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'needs_parent_action'
  | string

export type CollaborationTaskMode = 'foreground' | 'background' | string

export type SessionCollaborationTask = {
  runId: string
  label: string
  status: CollaborationTaskStatus
  summary?: string
  updatedAt?: string
  /** 子会话 id（只读进展用；不进侧栏） */
  childSessionId?: string
  mode?: CollaborationTaskMode
  /** 用户点「知道了」后本地隐藏终态条 */
  dismissed?: boolean
}

const TERMINAL = new Set([
  'completed',
  'failed',
  'cancelled',
])

export function isTerminalCollaborationStatus(status: string | undefined): boolean {
  if (typeof status !== 'string') return false
  return TERMINAL.has(status.trim().toLowerCase())
}

export function isActiveCollaborationStatus(status: string | undefined): boolean {
  const s = typeof status === 'string' ? status.trim().toLowerCase() : ''
  return s === 'queued' || s === 'running' || s === 'needs_parent_action'
}

/** Composer 上方 / Tabs 应展示的条目（未 dismiss） */
export function shouldShowCollaborationTask(task: SessionCollaborationTask): boolean {
  if (task.dismissed) return false
  return true
}

export function collaborationStatusHint(status: string): string {
  const s = status.trim().toLowerCase()
  if (s === 'queued') return '排队中'
  if (s === 'running') return '进行中'
  if (s === 'completed') return '已完成'
  if (s === 'failed') return '未完成'
  if (s === 'cancelled') return '已结束'
  if (s === 'needs_parent_action') return '需要在主对话处理'
  return '进行中'
}

function normalizeMode(raw: unknown): CollaborationTaskMode | undefined {
  if (typeof raw !== 'string') return undefined
  const m = raw.trim().toLowerCase()
  if (!m) return undefined
  if (m === 'foreground' || m === 'background') return m
  return m
}

export function dtoToCollaborationTask(dto: SessionCollaborationTaskDto): SessionCollaborationTask {
  const child = typeof dto.child_session_id === 'string' ? dto.child_session_id.trim() : ''
  return {
    runId: dto.run_id,
    label: (dto.label || '').trim() || '协作任务',
    status: dto.status,
    summary: dto.summary?.trim() || undefined,
    updatedAt: dto.updated_at,
    childSessionId: child || undefined,
    mode: normalizeMode(dto.mode),
  }
}

export function upsertCollaborationTask(
  list: SessionCollaborationTask[],
  patch: SessionCollaborationTask,
): SessionCollaborationTask[] {
  const idx = list.findIndex((t) => t.runId === patch.runId)
  if (idx < 0) return [...list, patch]
  const prev = list[idx]
  const next = list.slice()
  next[idx] = {
    ...prev,
    ...patch,
    dismissed: patch.dismissed ?? prev.dismissed,
    summary: patch.summary !== undefined ? patch.summary : prev.summary,
    childSessionId: patch.childSessionId ?? prev.childSessionId,
    mode: patch.mode ?? prev.mode,
  }
  return next
}

export function dismissCollaborationTask(
  list: SessionCollaborationTask[],
  runId: string,
): SessionCollaborationTask[] {
  const id = runId.trim()
  if (!id) return list
  return list.map((t) => (t.runId === id ? { ...t, dismissed: true } : t))
}

export function removeCollaborationTask(
  list: SessionCollaborationTask[],
  runId: string,
): SessionCollaborationTask[] {
  const id = runId.trim()
  if (!id) return list
  return list.filter((t) => t.runId !== id)
}

export function applySubagentProgressToTasks(
  list: SessionCollaborationTask[],
  event: ChatProgressEvent,
): SessionCollaborationTask[] {
  if (
    event.type !== 'subagent_started'
    && event.type !== 'subagent_progress'
    && event.type !== 'subagent_done'
  ) {
    return list
  }
  const runId = typeof event.run_id === 'string' ? event.run_id.trim() : ''
  if (!runId) return list
  const label = (event.label || '').trim() || '协作任务'
  const status = (event.status || '').trim() || (
    event.type === 'subagent_started' ? 'running'
      : event.type === 'subagent_done' ? 'completed'
        : 'running'
  )
  const summary = 'summary' in event && typeof event.summary === 'string'
    ? event.summary.trim() || undefined
    : undefined
  const childRaw = 'child_session_id' in event ? event.child_session_id : undefined
  const childSessionId = typeof childRaw === 'string' ? childRaw.trim() || undefined : undefined
  const mode = normalizeMode('mode' in event ? event.mode : undefined)
  return upsertCollaborationTask(list, {
    runId,
    label,
    status,
    summary,
    childSessionId,
    mode,
    updatedAt: new Date().toISOString(),
    dismissed: false,
  })
}

const ACTIVE_TAB_ORDER: Record<string, number> = {
  running: 0,
  queued: 1,
  needs_parent_action: 2,
}

function tabSortKey(task: SessionCollaborationTask): [number, number, string] {
  const status = task.status.trim().toLowerCase()
  if (status === 'running' || status === 'queued') {
    return [0, ACTIVE_TAB_ORDER[status] ?? 0, task.updatedAt ?? '']
  }
  if (status === 'needs_parent_action') {
    return [1, 0, task.updatedAt ?? '']
  }
  return [2, 0, task.updatedAt ?? '']
}

/** Tabs 排序：主对话后 running/queued → needs_parent_action → 终态（updatedAt 降序） */
export function sortCollaborationTasksForTabs(
  tasks: SessionCollaborationTask[],
): SessionCollaborationTask[] {
  return [...tasks].sort((a, b) => {
    const [ga, sa, ta] = tabSortKey(a)
    const [gb, sb, tb] = tabSortKey(b)
    if (ga !== gb) return ga - gb
    if (sa !== sb) return sa - sb
    // 同组内 updatedAt 降序（较新靠前）
    return tb.localeCompare(ta)
  })
}

export function mergeCollaborationTasksFromApi(
  prev: SessionCollaborationTask[],
  dtos: SessionCollaborationTaskDto[],
): SessionCollaborationTask[] {
  const dismissed = new Map(
    prev.filter((t) => t.dismissed).map((t) => [t.runId, true] as const),
  )
  const next = dtos.map((dto) => {
    const task = dtoToCollaborationTask(dto)
    const prevTask = prev.find((t) => t.runId === task.runId)
    const merged: SessionCollaborationTask = {
      ...task,
      // list 偶发缺字段时保留 SSE 已写入的子会话 id / mode
      childSessionId: task.childSessionId ?? prevTask?.childSessionId,
      mode: task.mode ?? prevTask?.mode,
    }
    if (dismissed.has(merged.runId) && isTerminalCollaborationStatus(merged.status)) {
      return { ...merged, dismissed: true }
    }
    return merged
  })
  // 保留仅本地、API 尚未列出的进行中项（SSE 领先 list）
  for (const t of prev) {
    if (next.some((n) => n.runId === t.runId)) continue
    if (isActiveCollaborationStatus(t.status) && !t.dismissed) {
      next.push(t)
    }
  }
  return next
}
