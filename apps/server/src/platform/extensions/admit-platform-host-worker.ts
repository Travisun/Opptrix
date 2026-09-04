import type { HostWorkerStatus } from './types.js'
import type { PlatformContext } from '../types.js'

/**
 * Readonly diagnostic: Ingress admit → info().hostWorker.
 * Proves Ingress ⊥ Inference (no chat / no gate submit / no activate / no .opx load).
 */
export function admitPlatformHostWorker(
  platform: Pick<PlatformContext, 'ingress' | 'info'>,
  opts?: { origin?: string },
):
  | {
      ok: true
      traceId: string
      origin: string
      hostWorker: HostWorkerStatus
    }
  | { ok: false; error: string } {
  const admitted = platform.ingress.admit(opts?.origin ?? 'web.diagnostic', {
    text: 'platform.hostWorker',
  })
  if (!admitted.ok) {
    return { ok: false, error: admitted.error }
  }
  return {
    ok: true,
    traceId: admitted.envelope.traceId,
    origin: admitted.envelope.origin,
    hostWorker: platform.info().hostWorker,
  }
}
