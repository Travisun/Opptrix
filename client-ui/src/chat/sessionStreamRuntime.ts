import type { ChatLiveTrace, ChatProgressEvent, ChatUserPromptPayload } from '../types/chatProgress'
import { formatTokenCount } from './formatTokenCount.ts'

export type SessionStreamSnapshot = {
  liveTrace: ChatLiveTrace | null
  pendingUserPrompt: ChatUserPromptPayload | null
  userPromptSubmitting: boolean
  /** 会话内上下文整理轻提示 */
  contextHint: string | null
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
  return {
    liveTrace: { steps: [], thinkingLabel: label },
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
    case 'thinking':
      return {
        ...snapshot,
        liveTrace: {
          steps: snapshot.liveTrace?.steps ?? [],
          thinkingLabel: event.label,
          thinkingSnippet: event.snippet ?? snapshot.liveTrace?.thinkingSnippet,
        },
      }
    case 'context_compact':
      return {
        ...snapshot,
        contextHint: event.message,
        liveTrace: {
          steps: snapshot.liveTrace?.steps ?? [],
          thinkingLabel: '正在整理对话要点…',
          thinkingSnippet: snapshot.liveTrace?.thinkingSnippet,
        },
      }
    case 'user_prompt':
      return {
        ...snapshot,
        pendingUserPrompt: event.prompt,
        liveTrace: {
          steps: snapshot.liveTrace?.steps ?? [],
          thinkingLabel: '等待你的确认…',
          thinkingSnippet: snapshot.liveTrace?.thinkingSnippet,
        },
      }
    case 'tool_start':
      return {
        ...snapshot,
        liveTrace: {
          thinkingLabel: snapshot.liveTrace?.thinkingLabel,
          thinkingSnippet: snapshot.liveTrace?.thinkingSnippet,
          steps: [...(snapshot.liveTrace?.steps ?? []), event.step],
        },
      }
    case 'tool_done':
      return {
        ...snapshot,
        pendingUserPrompt: null,
        liveTrace: {
          thinkingLabel: snapshot.liveTrace?.thinkingLabel ?? '模型正在整理结果…',
          thinkingSnippet: snapshot.liveTrace?.thinkingSnippet,
          steps: (snapshot.liveTrace?.steps ?? []).map(step =>
            step.id === event.step.id ? event.step : step,
          ),
        },
      }
    case 'reply': {
      // 与思考态同位文案；多轮工具后若已是「整理」态则保持，避免回跳
      const consolidating = (snapshot.liveTrace?.thinkingLabel ?? '').includes('整理')
      const base = consolidating ? '模型正在整理结果' : '模型正在思考'
      const thinkingLabel = event.estimatedTokens != null
        ? `${base} · 约 ${formatTokenCount(event.estimatedTokens)} tokens`
        : `${base}…`
      return {
        ...snapshot,
        liveTrace: {
          steps: snapshot.liveTrace?.steps ?? [],
          thinkingLabel,
          thinkingSnippet: snapshot.liveTrace?.thinkingSnippet,
        },
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
