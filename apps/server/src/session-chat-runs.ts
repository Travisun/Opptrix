const running = new Map<string, AbortController>()

/** Register (or replace) the in-flight chat run for a session. */
export function registerSessionChat(sessionId: string): AbortController {
  running.get(sessionId)?.abort()
  const ac = new AbortController()
  running.set(sessionId, ac)
  return ac
}

export function cancelSessionChat(sessionId: string): boolean {
  const ac = running.get(sessionId)
  if (!ac) return false
  ac.abort()
  return true
}

export function clearSessionChat(sessionId: string, ac: AbortController) {
  if (running.get(sessionId) === ac) running.delete(sessionId)
}
