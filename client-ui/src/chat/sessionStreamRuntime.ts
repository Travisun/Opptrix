import type { ChatLiveTrace, ChatProgressEvent, ChatToolStep, ChatUserPromptPayload } from '../types/chatProgress'
import { formatTokenCount } from './formatTokenCount.ts'
import {
  joinReasoningSegments,
  normalizeReasoningSegments,
  resolveReasoningSegments,
  type ReasoningSegment,
} from './reasoningTimeline.ts'

export type SessionStreamSnapshot = {
  liveTrace: ChatLiveTrace | null
  pendingUserPrompt: ChatUserPromptPayload | null
  userPromptSubmitting: boolean
  /** 会话内上下文整理轻提示 */
  contextHint: string | null
}

/** 去掉尾部省略号，得到纯净 phaseLabel */
export function stripPhaseEllipsis(label: string): string {
  return label.replace(/[…]+$/u, '').replace(/\.{2,}$/u, '').trim()
}

/**
 * 拼装实时状态行：`模型正在整理结果 · 约 1.2k tokens · 第 8 步…`
 * 无 token 时省略 token 段；steps≤0 时省略步数段。
 */
export function formatLiveThinkingStatus(
  phaseLabel: string | undefined,
  estimatedTokens: number | undefined,
  stepCount: number,
): string | undefined {
  if (!phaseLabel) return undefined
  const parts = [phaseLabel]
  if (estimatedTokens != null && Number.isFinite(estimatedTokens)) {
    parts.push(`约 ${formatTokenCount(estimatedTokens)} tokens`)
  }
  if (stepCount > 0) {
    parts.push(`第 ${stepCount} 步`)
  }
  return `${parts.join(' · ')}…`
}

/** 从已有 trace 解析 phaseLabel（兼容仅有 thinkingLabel 的旧快照） */
function resolvePhaseLabel(trace: ChatLiveTrace | null | undefined, fallback: string): string {
  if (trace?.phaseLabel) return trace.phaseLabel
  const raw = trace?.thinkingLabel
  if (!raw) return fallback
  const base = stripPhaseEllipsis(raw).split(' · ')[0]?.trim()
  return base || fallback
}

function rebuildLiveTrace(
  prev: ChatLiveTrace | null | undefined,
  patch: {
    steps?: ChatToolStep[]
    phaseLabel?: string
    /** 显式传入（含 undefined）表示覆盖；不传则保留上一轮 */
    estimatedTokens?: number | undefined
    clearEstimatedTokens?: boolean
    thinkingSnippet?: string | undefined
    thinkingSegments?: ReasoningSegment[] | undefined
  },
): ChatLiveTrace {
  const steps = patch.steps ?? prev?.steps ?? []
  const phaseLabel = patch.phaseLabel ?? resolvePhaseLabel(prev, '')
  const estimatedTokens = patch.clearEstimatedTokens
    ? undefined
    : ('estimatedTokens' in patch ? patch.estimatedTokens : prev?.estimatedTokens)
  const thinkingSegments = 'thinkingSegments' in patch
    ? patch.thinkingSegments
    : prev?.thinkingSegments
  const thinkingSnippet = 'thinkingSnippet' in patch
    ? patch.thinkingSnippet
    : (thinkingSegments?.length
      ? joinReasoningSegments(thinkingSegments)
      : prev?.thinkingSnippet)
  return {
    steps,
    phaseLabel: phaseLabel || undefined,
    estimatedTokens,
    thinkingSnippet,
    thinkingSegments,
    thinkingLabel: formatLiveThinkingStatus(
      phaseLabel || undefined,
      estimatedTokens,
      steps.length,
    ),
  }
}

export function createEmptyStreamSnapshot(): SessionStreamSnapshot {
  return {
    liveTrace: null,
    pendingUserPrompt: null,
    userPromptSubmitting: false,
    contextHint: null,
  }
}

export function createThinkingStreamSnapshot(label = '模型正在思考…'): SessionStreamSnapshot {
  const phaseLabel = stripPhaseEllipsis(label)
  return {
    liveTrace: {
      steps: [],
      phaseLabel,
      thinkingLabel: formatLiveThinkingStatus(phaseLabel, undefined, 0),
    },
    pendingUserPrompt: null,
    userPromptSubmitting: false,
    contextHint: null,
  }
}

export function applyChatProgressEvent(
  snapshot: SessionStreamSnapshot,
  event: ChatProgressEvent,
): SessionStreamSnapshot {
  switch (event.type) {
    case 'thinking': {
      const incoming = normalizeReasoningSegments(event.segments)
      let thinkingSegments: ReasoningSegment[] | undefined
      if (incoming?.length) {
        thinkingSegments = incoming
      } else if (event.snippet != null && event.snippet !== '') {
        // 旧服务端仅推 snippet：按 SEP 降级分段
        thinkingSegments = resolveReasoningSegments(undefined, event.snippet)
      } else {
        thinkingSegments = snapshot.liveTrace?.thinkingSegments
      }
      const segmentsOrUndef = thinkingSegments?.length ? thinkingSegments : undefined
      return {
        ...snapshot,
        liveTrace: rebuildLiveTrace(snapshot.liveTrace, {
          phaseLabel: stripPhaseEllipsis(event.label),
          clearEstimatedTokens: true,
          thinkingSegments: segmentsOrUndef,
          thinkingSnippet: event.snippet
            ?? (segmentsOrUndef ? joinReasoningSegments(segmentsOrUndef) : undefined)
            ?? snapshot.liveTrace?.thinkingSnippet,
        }),
      }
    }
    case 'context_compact':
      return {
        ...snapshot,
        contextHint: event.message,
        liveTrace: rebuildLiveTrace(snapshot.liveTrace, {
          phaseLabel: '正在整理对话要点',
          thinkingSnippet: snapshot.liveTrace?.thinkingSnippet,
          thinkingSegments: snapshot.liveTrace?.thinkingSegments,
        }),
      }
    case 'user_prompt':
      return {
        ...snapshot,
        pendingUserPrompt: event.prompt,
        liveTrace: rebuildLiveTrace(snapshot.liveTrace, {
          phaseLabel: '等待你的确认',
          thinkingSnippet: snapshot.liveTrace?.thinkingSnippet,
          thinkingSegments: snapshot.liveTrace?.thinkingSegments,
        }),
      }
    case 'tool_start':
      return {
        ...snapshot,
        liveTrace: rebuildLiveTrace(snapshot.liveTrace, {
          steps: [...(snapshot.liveTrace?.steps ?? []), event.step],
        }),
      }
    case 'tool_done':
      return {
        ...snapshot,
        pendingUserPrompt: null,
        liveTrace: rebuildLiveTrace(snapshot.liveTrace, {
          phaseLabel: '模型正在整理结果',
          steps: (snapshot.liveTrace?.steps ?? []).map(step =>
            step.id === event.step.id ? event.step : step,
          ),
        }),
      }
    case 'reply': {
      // 与思考态同位文案；多轮工具后若已是「整理」态则保持，避免回跳
      const prevPhase = resolvePhaseLabel(snapshot.liveTrace, '')
      const consolidating = prevPhase.includes('整理')
      const phaseLabel = prevPhase || (consolidating ? '模型正在整理结果' : '模型正在思考')
      return {
        ...snapshot,
        liveTrace: rebuildLiveTrace(snapshot.liveTrace, {
          phaseLabel,
          // reply 无估算时清空，与旧行为一致（不残留假数字）
          estimatedTokens: event.estimatedTokens,
          clearEstimatedTokens: event.estimatedTokens == null,
        }),
      }
    }
    case 'done':
    case 'error':
      return {
        ...snapshot,
        pendingUserPrompt: null,
      }
    default:
      return snapshot
  }
}

export function syncStreamSnapshotToUi(
  snapshot: SessionStreamSnapshot,
  ui: {
    setLiveTrace: (value: ChatLiveTrace | null) => void
    setPendingUserPrompt: (value: ChatUserPromptPayload | null) => void
    setUserPromptSubmitting: (value: boolean) => void
  } | null | undefined,
) {
  if (!ui) return
  ui.setLiveTrace(snapshot.liveTrace)
  ui.setPendingUserPrompt(snapshot.pendingUserPrompt)
  ui.setUserPromptSubmitting(snapshot.userPromptSubmitting)
}
