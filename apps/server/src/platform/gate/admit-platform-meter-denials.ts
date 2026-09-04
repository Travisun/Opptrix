import type { DenialRecord, PlatformContext } from '../types.js'

/**
 * Readonly diagnostic: Ingress admit → meter.listRecentDenials() + meter counters.
 * Proves Ingress ⊥ Inference (no chat / no gate submit).
 */
export function admitPlatformMeterDenials(
  platform: Pick<PlatformContext, 'ingress' | 'meter'>,
  opts?: { origin?: string },
):
  | {
      ok: true
      traceId: string
      origin: string
      denials: DenialRecord[]
      recentDenialCount: number
      denyCount: number
      submitCount: number
      errorCount: number
    }
  | { ok: false; error: string } {
  const origin =
    typeof opts?.origin === 'string' && opts.origin.trim()
      ? opts.origin.trim()
      : 'web.diagnostic'

  const admitted = platform.ingress.admit(origin, {
    text: 'platform.meter.denials',
  })
  if (!admitted.ok) {
    return { ok: false, error: admitted.error }
  }

  const snap = platform.meter.snapshot()
  const denials = platform.meter.listRecentDenials()

  return {
    ok: true,
    traceId: admitted.envelope.traceId,
    origin: admitted.envelope.origin,
    denials,
    recentDenialCount: snap.recentDenialCount,
    denyCount: snap.denyCount,
    submitCount: snap.submitCount,
    errorCount: snap.errorCount,
  }
}
