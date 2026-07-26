import type { LocalNotificationPayload } from './detect'

export type ChatNotificationAttention = {
  activeSessionId: string | null
  view: string
  documentVisible: boolean
  windowFocused: boolean
  /**
   * 本轮流式生成期间曾不可见或主窗口失焦。
   * 为 true 时即使当前又回到前台，完成通知仍应发出。
   */
  awayDuringGeneration?: boolean
}

export type ChatLocalNotificationResult =
  | 'skipped'
  | 'shown'
  | 'denied'
  | 'failed'

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

/** 文档隐藏或主窗口失焦 → 视为离开（用于生成期间标记） */
export function isAwayFromForeground(state: {
  documentVisible: boolean
  windowFocused: boolean
}): boolean {
  return !state.documentVisible || !state.windowFocused
}

/** 失焦 / 非 chat 页 / 其他会话 / 生成期间曾离开 → 应发通知 */
export function shouldNotify(
  targetSessionId: string,
  state: ChatNotificationAttention,
): boolean {
  if (state.awayDuringGeneration) return true
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
    silent: true,
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
    silent: true,
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
 * 返回结果便于权限被拒时做一次温和引导。
 */
export async function maybeShowChatLocalNotification(
  targetSessionId: string,
  attention: ChatNotificationAttention,
  payload: LocalNotificationPayload,
): Promise<ChatLocalNotificationResult> {
  if (!isElectronRuntime()) return 'skipped'
  if (!shouldNotify(targetSessionId, attention)) return 'skipped'
  try {
    const shown = await window.electronAPI?.showLocalNotification?.(payload)
    if (shown) return 'shown'
    const permission = await window.electronAPI?.notificationGetPermission?.()
    if (permission === 'denied') return 'denied'
    return 'failed'
  } catch {
    return 'failed'
  }
}
