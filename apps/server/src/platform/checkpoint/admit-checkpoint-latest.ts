import type { CheckpointLatest } from './types.js'
import type { PlatformContext } from '../types.js'

/**
 * Diagnostic: Ingress admit → checkpoint.latest(sessionId).
 * Proves Ingress ⊥ Inference (no chat / no gate submit / no restore).
 * Empty session returns ok with latest=null (mirrors store); blank sessionId fails admit.
 */
export function admitCheckpointLatest(
  platform: Pick<PlatformContext, 'ingress' | 'checkpoint'>,
  sessionId: string,
  opts?: { origin?: string },
):
  | {
      ok: true
      traceId: string
      origin: string
      latest: CheckpointLatest | null
    }
  | { ok: false; error: string } {
  const sid = typeof sessionId === 'string' ? sessionId.trim() : ''
  if (!sid) {
    return { ok: false, error: 'sessionId required' }
  }

  const admitted = platform.ingress.admit(opts?.origin ?? 'web.diagnostic', {
    text: 'platform.checkpoint.latest',
    sessionId: sid,
  })
  if (!admitted.ok) {
    return { ok: false, error: admitted.error }
  }

  return {
    ok: true,
    traceId: admitted.envelope.traceId,
    origin: admitted.envelope.origin,
    latest: platform.checkpoint.latest(sid),
  }
}
