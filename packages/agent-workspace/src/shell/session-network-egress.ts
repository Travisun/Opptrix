/** 会话级出站授权 — 内存存储，会话结束即失效；按域名 grant，无全网放行 */
export class SessionNetworkEgressStore {
  private readonly sessions = new Map<string, Set<string>>()
  /** 预授权 once hosts：下次 run / ask 回调时并入 once 或 consume */
  private readonly preflight = new Map<string, Set<string>>()

  private bucket(sessionId: string): Set<string> {
    let entry = this.sessions.get(sessionId)
    if (!entry) {
      entry = new Set()
      this.sessions.set(sessionId, entry)
    }
    return entry
  }

  private preflightBucket(sessionId: string): Set<string> {
    let entry = this.preflight.get(sessionId)
    if (!entry) {
      entry = new Set()
      this.preflight.set(sessionId, entry)
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
    this.preflightBucket(sessionId).delete(normalized)
  }

  grantPreflightHost(sessionId: string, host: string): void {
    const normalized = normalizeEgressHost(host)
    if (!normalized) return
    if (this.bucket(sessionId).has(normalized)) return
    this.preflightBucket(sessionId).add(normalized)
  }

  hasPreflightHost(sessionId: string, host: string): boolean {
    const normalized = normalizeEgressHost(host)
    if (!normalized) return false
    return this.preflight.get(sessionId)?.has(normalized) === true
  }

  /** 取出并清空本会话全部 preflight once hosts */
  consumeAllPreflight(sessionId: string): string[] {
    const entry = this.preflight.get(sessionId)
    if (!entry || entry.size === 0) return []
    const hosts = [...entry]
    this.preflight.delete(sessionId)
    return hosts
  }

  snapshot(sessionId: string): { hosts: string[] } {
    const entry = this.sessions.get(sessionId)
    return { hosts: entry ? [...entry] : [] }
  }

  clearSession(sessionId: string): void {
    this.sessions.delete(sessionId)
    this.preflight.delete(sessionId)
  }
}

export function normalizeEgressHost(host: string): string {
  return host.trim().toLowerCase().replace(/\.$/, '')
}

/** 从域名或 URL 提取可校验的 host */
export function hostFromNetworkInput(raw: string): string {
  const t = raw.trim()
  if (!t) return ''
  try {
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(t)) {
      return normalizeEgressHost(new URL(t).hostname)
    }
  } catch {
    /* fall through */
  }
  const noPath = t.split('/')[0] ?? t
  const hostPart = noPath.includes('@') ? (noPath.split('@').pop() ?? noPath) : noPath
  const noPort = hostPart.includes(']')
    ? hostPart.replace(/^\[/, '').replace(/\]:.*$/, '').replace(/\]$/, '')
    : (hostPart.split(':')[0] ?? hostPart)
  return normalizeEgressHost(noPort)
}

export const NETWORK_EGRESS_CONFIRM_OPTIONS = [
  { id: 'allow_host_once', label: '仅此一次' },
  { id: 'allow_host_session', label: '本对话同类操作都允许' },
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
