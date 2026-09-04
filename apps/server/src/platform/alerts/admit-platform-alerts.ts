import type { PlatformAlert, PlatformContext } from '../types.js'

/**
 * Readonly diagnostic: Ingress admit → then `alerts.list()` + alertsPending.
 * Proves Ingress ⊥ Inference (no chat / no gate submit).
 */
export function admitPlatformAlerts(
  platform: Pick<PlatformContext, 'ingress' | 'alerts' | 'info'>,
  opts?: { origin?: string; includeAcknowledged?: boolean; limit?: number },
):
  | {
      ok: true
      traceId: string
      origin: string
      alerts: PlatformAlert[]
      alertsPending: number
    }
  | { ok: false; error: string } {
  const admitted = platform.ingress.admit(opts?.origin ?? 'web.diagnostic', {
    text: 'platform.alerts',
  })
  if (!admitted.ok) {
    return { ok: false, error: admitted.error }
  }
  const listOpts: { includeAcknowledged?: boolean; limit?: number } = {}
  if (opts?.includeAcknowledged !== undefined) {
    listOpts.includeAcknowledged = opts.includeAcknowledged
  }
  if (opts?.limit !== undefined) {
    listOpts.limit = opts.limit
  }
  const alerts = platform.alerts.list(listOpts)
  return {
    ok: true,
    traceId: admitted.envelope.traceId,
    origin: admitted.envelope.origin,
    alerts,
    alertsPending: platform.info().alertsPending,
  }
}
