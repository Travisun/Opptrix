import type { PlatformContext } from '../types.js'

/**
 * Readonly diagnostic: Ingress admit → handsTicketsPending + pendingCount.
 * Count only — no ticket ids/tokens. Proves Ingress ⊥ Inference (no issue/invoke).
 */
export function admitPlatformHands(
  platform: Pick<PlatformContext, 'ingress' | 'hands' | 'info'>,
  opts?: { origin?: string },
):
  | {
      ok: true
      traceId: string
      origin: string
      handsTicketsPending: number
      pendingCount: number
    }
  | { ok: false; error: string } {
  const admitted = platform.ingress.admit(opts?.origin ?? 'web.diagnostic', {
    text: 'platform.hands',
  })
  if (!admitted.ok) {
    return { ok: false, error: admitted.error }
  }
  return {
    ok: true,
    traceId: admitted.envelope.traceId,
    origin: admitted.envelope.origin,
    handsTicketsPending: platform.info().handsTicketsPending,
    pendingCount: platform.hands.pendingCount(),
  }
}
