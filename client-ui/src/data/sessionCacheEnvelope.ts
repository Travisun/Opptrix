/** sessionStorage 缓存信封 — 携带 cached_at_ms 供客户端 TTL 判断 */

export type SessionCacheEnvelopeV1<T> = {
  v: 1
  cached_at_ms: number
  data: T
}

export function readSessionCacheEnvelope<T>(
  key: string,
  validate: (data: unknown) => data is T,
): { data: T; cached_at_ms: number } | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = sessionStorage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') return null

    const row = parsed as Partial<SessionCacheEnvelopeV1<T>> & { data?: unknown }
    if (row.v === 1 && typeof row.cached_at_ms === 'number' && validate(row.data)) {
      return { data: row.data, cached_at_ms: row.cached_at_ms }
    }

    // 兼容旧格式：裸 data，视为已过期
    if (validate(parsed)) {
      return { data: parsed, cached_at_ms: 0 }
    }
    return null
  } catch {
    return null
  }
}

export function writeSessionCacheEnvelope<T>(key: string, data: T, cachedAtMs = Date.now()): void {
  if (typeof window === 'undefined') return
  const envelope: SessionCacheEnvelopeV1<T> = {
    v: 1,
    cached_at_ms: cachedAtMs,
    data,
  }
  try {
    sessionStorage.setItem(key, JSON.stringify(envelope))
  } catch {
    /* quota / private mode */
  }
}
