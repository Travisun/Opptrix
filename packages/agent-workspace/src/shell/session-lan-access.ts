/**
 * 会话级局域网授权 — 内存存储；可覆盖全局 allow_lan_access=false。
 * 不写回 preference；clearSession 清理。LAN ≠ 出站放行，具体 host 仍走 egress 确认。
 */
import { getSandboxSettings } from '../sandbox-settings-store.js'

export class SessionLanAccessStore {
  private readonly sessions = new Set<string>()

  has(sessionId: string): boolean {
    return this.sessions.has(sessionId)
  }

  grant(sessionId: string): void {
    this.sessions.add(sessionId)
  }

  clearSession(sessionId: string): void {
    this.sessions.delete(sessionId)
  }
}

let defaultStore = new SessionLanAccessStore()

export function getSessionLanAccessStore(): SessionLanAccessStore {
  return defaultStore
}

export function resetSessionLanAccessStoreForTests(): void {
  defaultStore = new SessionLanAccessStore()
}

/** 有效 LAN = 全局设置 \|\| 本会话授权 */
export function isEffectiveLanAllowed(sessionId?: string): boolean {
  if (getSandboxSettings().allow_lan_access) return true
  if (sessionId && defaultStore.has(sessionId)) return true
  return false
}

export const SESSION_LAN_ASK_OPTIONS = [
  { id: 'allow_lan_session', label: '本对话允许局域网' },
  { id: 'deny', label: '不允许' },
] as const

export function applySessionLanAskChoice(
  sessionId: string,
  selectedIds: readonly string[],
): { granted: boolean; denied: boolean } {
  const id = selectedIds[0] ?? 'deny'
  if (id === 'allow_lan_session') {
    defaultStore.grant(sessionId)
    return { granted: true, denied: false }
  }
  return { granted: false, denied: true }
}
