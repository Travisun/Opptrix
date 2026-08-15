/**
 * 权限 / 工作区 / LAN / 密钥解析：子会话一律落到 rootSessionId。
 */

import { getUserDataStore } from '@opptrix/user-store'

const SESSION_NAMESPACE = 'session'

export type AuthSessionLookup = {
  kind?: 'user' | 'subagent' | string
  rootSessionId?: string | null
  parentSessionId?: string | null
}

function readSessionAuth(sessionId: string): AuthSessionLookup | null {
  try {
    return getUserDataStore().getDocument<AuthSessionLookup>(SESSION_NAMESPACE, sessionId)
  } catch {
    return null
  }
}

/**
 * 将任意 sessionId 解析为授权根（LAN/密钥/工作区 grant）。
 * 缺省或非 subagent → 自身；有 rootSessionId → root；否则沿 parent 上溯（防环）。
 */
export function resolveAuthSessionId(
  sessionId: string,
  lookup: (id: string) => AuthSessionLookup | null = readSessionAuth,
): string {
  const id = sessionId.trim()
  if (!id) return id

  const seen = new Set<string>()
  let cur = id
  for (let depth = 0; depth < 8; depth++) {
    if (seen.has(cur)) return cur
    seen.add(cur)
    const rec = lookup(cur)
    if (!rec) return cur
    const root = typeof rec.rootSessionId === 'string' ? rec.rootSessionId.trim() : ''
    if (root) return root
    if (rec.kind !== 'subagent') return cur
    const parent = typeof rec.parentSessionId === 'string' ? rec.parentSessionId.trim() : ''
    if (!parent || parent === cur) return cur
    cur = parent
  }
  return cur
}

/** 当前工具 ALS session 是否为子会话 */
export function isSubagentSessionId(
  sessionId: string,
  lookup: (id: string) => AuthSessionLookup | null = readSessionAuth,
): boolean {
  const rec = lookup(sessionId.trim())
  if (!rec) return false
  if (rec.kind === 'subagent') return true
  return Boolean(rec.parentSessionId)
}
