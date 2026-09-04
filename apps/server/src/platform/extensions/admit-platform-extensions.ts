import type { ExtensionRecord, HostWorkerStatus } from './types.js'
import type { PlatformContext } from '../types.js'

/**
 * Readonly diagnostic: Ingress admit → extensions.list() + active count + hostWorker.
 * Proves Ingress ⊥ Inference (no chat / no gate submit / no activate / no .opx load).
 */
export function admitPlatformExtensions(
  platform: Pick<PlatformContext, 'ingress' | 'extensions' | 'info'>,
  opts?: { origin?: string },
):
  | {
      ok: true
      traceId: string
      origin: string
      extensions: ExtensionRecord[]
      extensionsActive: number
      hostWorker: HostWorkerStatus
    }
  | { ok: false; error: string } {
  const admitted = platform.ingress.admit(opts?.origin ?? 'web.diagnostic', {
    text: 'platform.extensions',
  })
  if (!admitted.ok) {
    return { ok: false, error: admitted.error }
  }
  const snap = platform.info()
  return {
    ok: true,
    traceId: admitted.envelope.traceId,
    origin: admitted.envelope.origin,
    extensions: platform.extensions.list(),
    extensionsActive: snap.extensionsActive,
    hostWorker: snap.hostWorker,
  }
}
