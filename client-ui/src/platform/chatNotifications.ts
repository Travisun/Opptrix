import type { LocalNotificationPayload } from './detect'

export type ChatNotificationAttention = {
  activeSessionId: string | null
  view: string
  documentVisible: boolean
  windowFocused: boolean
}

const BODY_MAX = 120

function isElectronRuntime(): boolean {
  if (typeof window === 'undefined') return false
  return window.electronAPI?.isElectron === true
}

/** 用户正在盯着该会话的聊天页（前台可跳过通知） */
export function isAttendingChat(
  targetSessionId: string,
  state: ChatNotificationAttention,
): boolean {
  return (
    state.activeSessionId === targetSessionId
    && state.view === 'chat'
    && state.documentVisible
    && state.windowFocused
  )
}

/** 失焦 / 非 chat 页 / 其他会话 → 应发通知 */
export function shouldNotify(
  targetSessionId: string,
  state: ChatNotificationAttention,
): boolean {
  return !isAttendingChat(targetSessionId, state)
}

export function truncateNotificationText(text: string, maxLen = BODY_MAX): string {
  const normalized = text.replace(/\s+/g, ' ').trim()
  if (!normalized) return ''
  if (normalized.length <= maxLen) return normalized
  if (maxLen <= 1) return '…'
  return `${normalized.slice(0, maxLen - 1)}…`
}

export function buildChatDoneNotification(
  sessionId: string,
  sessionTitle?: string,
): LocalNotificationPayload {
  const body = truncateNotificationText(sessionTitle ?? '') || undefined
  return {
    title: '对话已生成完成',
    body,
    tag: `chat:done:${sessionId}`,
    sessionId,
    kind: 'chat_done',
  }
}

export function buildChatAskNotification(
  sessionId: string,
  promptSummary?: string,
): LocalNotificationPayload {
  const body = truncateNotificationText(promptSummary ?? '') || undefined
  return {
    title: '需要你的确认',
    body,
    tag: `chat:ask:${sessionId}`,
    sessionId,
    kind: 'chat_ask',
  }
}

export async function resolveWindowFocused(): Promise<boolean> {
  const api = typeof window !== 'undefined' ? window.electronAPI : undefined
  if (api?.windowIsFocused) {
    try {
      return await api.windowIsFocused()
    } catch {
      return false
    }
  }
  if (typeof document !== 'undefined') {
    return document.hasFocus()
  }
  return false
}

/**
 * Electron 下按注意力状态决定是否展示本地通知；Web / 失败静默 no-op。
 */
export async function maybeShowChatLocalNotification(
  targetSessionId: string,
  attention: ChatNotificationAttention,
  payload: LocalNotificationPayload,
): Promise<void> {
  if (!isElectronRuntime()) return
  if (!shouldNotify(targetSessionId, attention)) return
  try {
    await window.electronAPI?.showLocalNotification?.(payload)
  } catch {
    /* fire-and-forget */
  }
}
