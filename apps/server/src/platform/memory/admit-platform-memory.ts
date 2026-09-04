import type { PlatformContext } from '../types.js'

/**
 * Readonly diagnostic: Ingress admit → memory.getWorking + listDurable count.
 * Proves Ingress ⊥ Inference (no chat / no gate submit / no promote).
 * Empty session returns ok with working=null and durableCount=0; blank sessionId fails.
 */
export function admitPlatformMemory(
  platform: Pick<PlatformContext, 'ingress' | 'memory' | 'info'>,
  raw: { sessionId: string; origin?: string },
):
  | {
      ok: true
      traceId: string
      origin: string
      working: unknown | null
      durableCount: number
      memoryDurable: number
    }
  | { ok: false; error: string } {
  const sessionId =
    typeof raw?.sessionId === 'string' ? raw.sessionId.trim() : ''
  if (!sessionId) {
    return { ok: false, error: 'sessionId required' }
  }

  const origin =
    typeof raw.origin === 'string' && raw.origin.trim()
      ? raw.origin.trim()
      : 'web.diagnostic'

  const admitted = platform.ingress.admit(origin, {
    text: 'platform.memory',
    sessionId,
  })
  if (!admitted.ok) {
    return { ok: false, error: admitted.error }
  }

  const working = platform.memory.getWorking(sessionId)
  const listed = platform.memory.listDurable(sessionId)
  const durableCount = Array.isArray(listed)
    ? listed.length
    : platform.info().memoryDurable

  return {
    ok: true,
    traceId: admitted.envelope.traceId,
    origin: admitted.envelope.origin,
    working,
    durableCount,
    memoryDurable: platform.info().memoryDurable,
  }
}
