import type { PlatformContext } from '../types.js'

/**
 * Diagnostic: Ingress admit → alerts.acknowledge(id) + alertsPending.
 * Proves Ingress ⊥ Inference (no chat / no gate submit).
 * Unknown id returns ok with acknowledged=false (mirrors facade).
 */
export function admitAcknowledgeAlert(
  platform: Pick<PlatformContext, 'ingress' | 'alerts' | 'info'>,
  id: string,
  opts?: { origin?: string },
):
  | {
      ok: true
      traceId: string
      origin: string
      acknowledged: boolean
      alertsPending: number
    }
  | { ok: false; error: string } {
  const key = typeof id === 'string' ? id.trim() : ''
  if (!key) {
    return { ok: false, error: 'id required' }
  }

  const admitted = platform.ingress.admit(opts?.origin ?? 'web.diagnostic', {
    text: 'platform.alerts.ack',
  })
  if (!admitted.ok) {
    return { ok: false, error: admitted.error }
  }

  const acknowledged = platform.alerts.acknowledge(key)
  return {
    ok: true,
    traceId: admitted.envelope.traceId,
    origin: admitted.envelope.origin,
    acknowledged,
    alertsPending: platform.info().alertsPending,
  }
}
