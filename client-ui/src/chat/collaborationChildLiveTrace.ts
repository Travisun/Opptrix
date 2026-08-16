/**
 * 协作子任务实时过程（thinking / tools）— 与主会话 applyChatProgressEvent 对齐。
 *
 * Agent 期望 SSE shape（兼容多种字段名，Implementer 合入前可先走子会话 live-progress）：
 *
 * ```ts
 * // 1. 专用事件
 * { type: 'subagent_child_progress', run_id: string, child_session_id?: string,
 *   child: { type: 'thinking' | 'tool_start' | 'tool_done' | ... } }
 *
 * // 2. 嵌套在 subagent_progress
 * { type: 'subagent_progress', run_id: string, child_progress: { type: 'thinking', ... } }
 *
 * // 3. 扁平 relay（run_id + progress_type）
 * { type: 'subagent_child_progress', run_id: string, progress_type: 'thinking', label: '...' }
 * ```
 */

import type { ChatProgressEvent, ChatToolStep } from '../types/chatProgress'
import type { ReasoningSegment } from './reasoningTimeline'
import {
  applyChatProgressEvent,
  createEmptyStreamSnapshot,
  type SessionStreamSnapshot,
} from './sessionStreamRuntime'

const CHILD_INNER_TYPES = new Set([
  'thinking',
  'tool_start',
  'tool_done',
  'reply',
  'context_compact',
  'user_prompt',
  'steer_applied',
  'job_watch',
  'job_progress',
])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readRunId(raw: Record<string, unknown>): string {
  const direct = raw.run_id ?? raw.runId
  return typeof direct === 'string' ? direct.trim() : ''
}

function readChildSessionId(raw: Record<string, unknown>): string | undefined {
  const direct = raw.child_session_id ?? raw.childSessionId
  if (typeof direct !== 'string') return undefined
  const trimmed = direct.trim()
  return trimmed || undefined
}

function isInnerProgressEvent(value: unknown): value is ChatProgressEvent {
  if (!isRecord(value)) return false
  const t = value.type
  return typeof t === 'string' && CHILD_INNER_TYPES.has(t)
}

function readToolStep(raw: unknown): ChatToolStep | null {
  if (!isRecord(raw)) return null
  if (typeof raw.id !== 'string' || typeof raw.tool !== 'string') return null
  if (typeof raw.label !== 'string' || typeof raw.status !== 'string') return null
  if (typeof raw.startedAt !== 'string') return null
  return {
    id: raw.id,
    tool: raw.tool,
    label: raw.label,
    status: raw.status as ChatToolStep['status'],
    startedAt: raw.startedAt,
    argsPreview: typeof raw.argsPreview === 'string' ? raw.argsPreview : undefined,
    argsDetail: typeof raw.argsDetail === 'string' ? raw.argsDetail : undefined,
    thinking: typeof raw.thinking === 'string' ? raw.thinking : undefined,
    resultPreview: typeof raw.resultPreview === 'string' ? raw.resultPreview : undefined,
    resultDetail: typeof raw.resultDetail === 'string' ? raw.resultDetail : undefined,
    finishedAt: typeof raw.finishedAt === 'string' ? raw.finishedAt : undefined,
  }
}

function flattenChildRelay(raw: Record<string, unknown>): ChatProgressEvent | null {
  const progressType = raw.progress_type ?? raw.progressType ?? raw.event_type ?? raw.eventType
  if (typeof progressType !== 'string') return null
  const type = progressType.trim()
  if (!CHILD_INNER_TYPES.has(type)) return null

  if (type === 'thinking') {
    const segments = raw.segments
    return {
      type: 'thinking',
      round: typeof raw.round === 'number' ? raw.round : 0,
      label: typeof raw.label === 'string' ? raw.label : '模型正在思考…',
      snippet: typeof raw.snippet === 'string' ? raw.snippet : undefined,
      segments: Array.isArray(segments) ? segments as ReasoningSegment[] : undefined,
    }
  }
  if (type === 'tool_start' || type === 'tool_done') {
    const step = readToolStep(raw.step)
    if (!step) return null
    return { type, step }
  }
  if (type === 'reply') {
    return {
      type: 'reply',
      content: typeof raw.content === 'string' ? raw.content : undefined,
      estimatedTokens: typeof raw.estimatedTokens === 'number'
        ? raw.estimatedTokens
        : typeof raw.estimated_tokens === 'number'
          ? raw.estimated_tokens
          : undefined,
    }
  }
  return null
}

/** 从父会话 SSE 解析子任务过程事件；无匹配则 null */
export function parseChildProgressRelay(
  event: ChatProgressEvent,
): { runId: string; childSessionId?: string; inner: ChatProgressEvent } | null {
  const raw = event as unknown as Record<string, unknown>
  const type = typeof raw.type === 'string' ? raw.type.trim() : ''

  if (type === 'subagent_child_progress') {
    const runId = readRunId(raw)
    if (!runId) return null
    const nested = raw.child ?? raw.event ?? raw.progress ?? raw.child_progress ?? raw.childProgress
    if (isInnerProgressEvent(nested)) {
      return {
        runId,
        childSessionId: readChildSessionId(raw),
        inner: nested,
      }
    }
    const flat = flattenChildRelay(raw)
    if (flat) {
      return { runId, childSessionId: readChildSessionId(raw), inner: flat }
    }
    return null
  }

  if (type === 'subagent_progress' || type === 'subagent_started') {
    const nested = raw.child ?? raw.child_progress ?? raw.childProgress ?? raw.event
    if (!isInnerProgressEvent(nested)) return null
    const runId = readRunId(raw)
    if (!runId) return null
    return {
      runId,
      childSessionId: readChildSessionId(raw),
      inner: nested,
    }
  }

  return null
}

export function applyChildLiveProgressEvent(
  snapshot: SessionStreamSnapshot,
  inner: ChatProgressEvent,
): SessionStreamSnapshot {
  return applyChatProgressEvent(snapshot, inner)
}

export function createChildLiveStreamSnapshot(): SessionStreamSnapshot {
  return createEmptyStreamSnapshot()
}

export function childSnapshotLiveTrace(snapshot: SessionStreamSnapshot | undefined) {
  return snapshot?.liveTrace ?? null
}

/** 子会话 live-progress 中应忽略的父级协作 meta 事件 */
export function shouldIgnoreChildSessionProgressEvent(event: ChatProgressEvent): boolean {
  return event.type === 'subagent_started'
    || event.type === 'subagent_progress'
    || event.type === 'subagent_done'
    || event.type === 'subagent_child_progress'
    || event.type === 'done'
    || event.type === 'error'
}
