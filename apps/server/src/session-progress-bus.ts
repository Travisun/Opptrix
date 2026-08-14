/**
 * 按 sessionId 广播 ChatProgressEvent（用于 turn-wake 续跑等无 HTTP 流客户端的进度）。
 */
import type { ChatProgressEvent } from '@opptrix/agent'

export type SessionProgressListener = (event: ChatProgressEvent) => void

const listeners = new Map<string, Set<SessionProgressListener>>()

export function publishSessionProgress(sessionId: string, event: ChatProgressEvent): void {
  const id = String(sessionId ?? '').trim()
  if (!id) return
  const set = listeners.get(id)
  if (!set || set.size === 0) return
  for (const fn of [...set]) {
    try {
      fn(event)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.warn(`[session-progress-bus] listener error (${id}): ${msg}`)
    }
  }
}

export function subscribeSessionProgress(
  sessionId: string,
  listener: SessionProgressListener,
): () => void {
  const id = String(sessionId ?? '').trim()
  if (!id) return () => {}
  let set = listeners.get(id)
  if (!set) {
    set = new Set()
    listeners.set(id, set)
  }
  set.add(listener)
  return () => {
    const cur = listeners.get(id)
    if (!cur) return
    cur.delete(listener)
    if (cur.size === 0) listeners.delete(id)
  }
}

/** 测试：某会话当前订阅数 */
export function sessionProgressListenerCountForTests(sessionId: string): number {
  return listeners.get(String(sessionId ?? '').trim())?.size ?? 0
}

export function resetSessionProgressBusForTests(): void {
  listeners.clear()
}
