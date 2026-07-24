/** 会话级出站授权 — 内存存储，会话结束即失效；按域名 grant，无全网放行 */
export class SessionNetworkEgressStore {
  private readonly sessions = new Map<string, Set<string>>()

  private bucket(sessionId: string): Set<string> {
    let entry = this.sessions.get(sessionId)
    if (!entry) {
      entry = new Set()
      this.sessions.set(sessionId, entry)
    }
    return entry
  }

  /** 是否已在 allowlist（本会话显式 grant 的 host） */
  hasHost(sessionId: string, host: string): boolean {
    const normalized = normalizeEgressHost(host)
    if (!normalized) return false
    return this.bucket(sessionId).has(normalized)
  }

  hasAnyGrant(sessionId: string): boolean {
    const entry = this.sessions.get(sessionId)
    return entry != null && entry.size > 0
  }

  grantHost(sessionId: string, host: string): void {
    const normalized = normalizeEgressHost(host)
    if (!normalized) return
    this.bucket(sessionId).add(normalized)
  }

  snapshot(sessionId: string): { hosts: string[] } {
    const entry = this.sessions.get(sessionId)
    return { hosts: entry ? [...entry] : [] }
  }

  clearSession(sessionId: string): void {
    this.sessions.delete(sessionId)
  }
}

export function normalizeEgressHost(host: string): string {
  return host.trim().toLowerCase().replace(/\.$/, '')
}

export const NETWORK_EGRESS_CONFIRM_OPTIONS = [
  { id: 'allow_host_once', label: '仅此一次允许访问该目标' },
  { id: 'allow_host_session', label: '本对话允许该目标' },
  { id: 'cancel', label: '取消' },
] as const

export type NetworkEgressConfirmChoice =
  | 'allow_host_once'
  | 'allow_host_session'
  | 'cancel'

export function parseNetworkEgressChoice(
  selectedIds: readonly string[],
): NetworkEgressConfirmChoice {
  const id = selectedIds[0] ?? 'cancel'
  if (id === 'allow_host_once' || id === 'allow_host_session' || id === 'cancel') {
    return id
  }
  return 'cancel'
}
