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

/** Web 通知点击 → 打开会话（与桌面协议路由同形，由 useDesktopShell 消费） */
export const OPPTRIX_OPEN_CHAT_EVENT = 'opptrix:open-chat'

export type OpptrixOpenChatDetail = {
  sessionId?: string
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

/** 文档隐藏或主窗口失焦 → 视为离开（用于生成期间标记） */
export function isAwayFromForeground(state: {
  documentVisible: boolean
  windowFocused: boolean
}): boolean {
  return !state.documentVisible || !state.windowFocused
}

/**
 * 流式过程/草稿不算完成；仅未取消的 done 表示本轮终答已产出。
 * 不依赖 ChatApp / ChatProgressEvent，避免循环引用。
 */
export function isChatTurnCompleteEvent(event: {
  type: string
  cancelled?: boolean
  content?: string
  draft?: boolean
}): boolean {
  return event.type === 'done' && event.cancelled !== true
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

/** 浏览器是否提供 Notification API（不含 Push） */
export function isWebNotificationSupported(): boolean {
  return typeof Notification !== 'undefined'
}

/**
 * 聚焦窗口并派发打开会话事件（Web 通知点击 / 测试复用）。
 */
export function dispatchOpenChatFromNotification(sessionId?: string): void {
  if (typeof window === 'undefined') return
  try {
    window.focus()
  } catch {
    /* ignore */
  }
  const trimmed = typeof sessionId === 'string' ? sessionId.trim() : ''
  const detail: OpptrixOpenChatDetail = trimmed ? { sessionId: trimmed } : {}
  window.dispatchEvent(new CustomEvent(OPPTRIX_OPEN_CHAT_EVENT, { detail }))
}

async function ensureWebNotificationPermission(): Promise<NotificationPermission> {
  if (!isWebNotificationSupported()) return 'denied'
  if (Notification.permission === 'granted' || Notification.permission === 'denied') {
    return Notification.permission
  }
  try {
    return await Notification.requestPermission()
  } catch {
    return 'denied'
  }
}

async function showWebChatNotification(
  payload: LocalNotificationPayload,
): Promise<ChatLocalNotificationResult> {
  if (!isWebNotificationSupported()) return 'skipped'

  const permission = await ensureWebNotificationPermission()
  if (permission === 'denied') return 'denied'
  if (permission !== 'granted') return 'failed'

  try {
    const notification = new Notification(payload.title, {
      body: payload.body,
      tag: payload.tag,
      silent: payload.silent === true,
    })
    notification.onclick = () => {
      dispatchOpenChatFromNotification(payload.sessionId)
      try {
        notification.close()
      } catch {
        /* ignore */
      }
    }
    return 'shown'
  } catch {
    return 'failed'
  }
}

/**
 * 按注意力状态决定是否展示本地通知（Electron IPC 或浏览器 Notification）。
 * 无 Push；返回结果便于权限被拒时做一次温和引导。
 */
export async function maybeShowChatLocalNotification(
  targetSessionId: string,
  attention: ChatNotificationAttention,
  payload: LocalNotificationPayload,
): Promise<ChatLocalNotificationResult> {
  if (!shouldNotify(targetSessionId, attention)) return 'skipped'

  if (isElectronRuntime()) {
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

  return showWebChatNotification(payload)
}
