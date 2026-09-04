import type { PlatformContext, PlatformInfoSnapshot } from '../types.js'

/**
 * Readonly diagnostic: Ingress admit → then `platform.info()`.
 * Proves Ingress ⊥ Inference (no chat / no gate submit).
 */
export function admitPlatformInfo(
  platform: Pick<PlatformContext, 'ingress' | 'info'>,
  opts?: { origin?: string },
):
  | { ok: true; traceId: string; origin: string; info: PlatformInfoSnapshot }
  | { ok: false; error: string } {
  const admitted = platform.ingress.admit(opts?.origin ?? 'web.diagnostic', {
    text: 'platform.info',
  })
  if (!admitted.ok) {
    return { ok: false, error: admitted.error }
  }
  return {
    ok: true,
    traceId: admitted.envelope.traceId,
    origin: admitted.envelope.origin,
    info: platform.info(),
  }
}
