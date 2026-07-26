/**
 * 会话级密钥授权 — 内存 allowlist；clearSession 清理。
 * 保险箱条目用户级持久化；本对话须显式 grant 后才可用于 shell_run.secret_refs。
 */
export class SessionSecretAccessStore {
  private readonly sessions = new Map<string, Set<string>>()

  has(sessionId: string, name: string): boolean {
    const n = name.trim()
    if (!n) return false
    const set = this.sessions.get(sessionId)
    return set ? set.has(n) : false
  }

  grant(sessionId: string, name: string): void {
    const n = name.trim()
    if (!n) return
    const set = this.sessions.get(sessionId) ?? new Set<string>()
    set.add(n)
    this.sessions.set(sessionId, set)
  }

  list(sessionId: string): string[] {
    const set = this.sessions.get(sessionId)
    if (!set) return []
    return [...set].sort((a, b) => a.localeCompare(b))
  }

  revoke(sessionId: string, name: string): boolean {
    const n = name.trim()
    const set = this.sessions.get(sessionId)
    if (!set || !n) return false
    return set.delete(n)
  }

  clearSession(sessionId: string): void {
    this.sessions.delete(sessionId)
  }
}

let defaultStore = new SessionSecretAccessStore()

export function getSessionSecretAccessStore(): SessionSecretAccessStore {
  return defaultStore
}

export function resetSessionSecretAccessStoreForTests(): void {
  defaultStore = new SessionSecretAccessStore()
}

export const SESSION_SECRET_GRANT_ASK_OPTIONS = [
  { id: 'allow_secret_session', label: '允许本对话使用' },
  { id: 'deny', label: '取消' },
] as const

export function applySessionSecretGrantChoice(
  sessionId: string,
  secretName: string,
  selectedIds: readonly string[],
): { granted: boolean; denied: boolean } {
  const id = selectedIds[0] ?? 'deny'
  if (id === 'allow_secret_session') {
    defaultStore.grant(sessionId, secretName)
    return { granted: true, denied: false }
  }
  return { granted: false, denied: true }
}
