import type { PlatformContext } from '../types.js'

/**
 * Diagnostic: Ingress admit → checkpoint.get(id).
 * Proves Ingress ⊥ Inference (no chat / no gate submit / no restore).
 * Unknown id returns ok with payload=null (mirrors store); blank id fails admit.
 */
export function admitCheckpointGet(
  platform: Pick<PlatformContext, 'ingress' | 'checkpoint'>,
  id: string,
  opts?: { origin?: string },
):
  | {
      ok: true
      traceId: string
      origin: string
      payload: unknown | null
    }
  | { ok: false; error: string } {
  const key = typeof id === 'string' ? id.trim() : ''
  if (!key) {
    return { ok: false, error: 'id required' }
  }

  const admitted = platform.ingress.admit(opts?.origin ?? 'web.diagnostic', {
    text: 'platform.checkpoint.get',
  })
  if (!admitted.ok) {
    return { ok: false, error: admitted.error }
  }

  return {
    ok: true,
    traceId: admitted.envelope.traceId,
    origin: admitted.envelope.origin,
    payload: platform.checkpoint.get(key),
  }
}
