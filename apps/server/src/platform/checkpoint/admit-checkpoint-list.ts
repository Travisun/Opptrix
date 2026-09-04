import type { CheckpointListItem } from './types.js'
import type { PlatformContext } from '../types.js'

/**
 * Diagnostic: Ingress admit → checkpoint.list(sessionId).
 * Proves Ingress ⊥ Inference (no chat / no gate submit / no restore).
 * Empty session returns ok with checkpoints=[] (mirrors store); blank sessionId fails admit.
 */
export function admitCheckpointList(
  platform: Pick<PlatformContext, 'ingress' | 'checkpoint'>,
  sessionId: string,
  opts?: { origin?: string },
):
  | {
      ok: true
      traceId: string
      origin: string
      checkpoints: CheckpointListItem[]
    }
  | { ok: false; error: string } {
  const sid = typeof sessionId === 'string' ? sessionId.trim() : ''
  if (!sid) {
    return { ok: false, error: 'sessionId required' }
  }

  const admitted = platform.ingress.admit(opts?.origin ?? 'web.diagnostic', {
    text: 'platform.checkpoint.list',
    sessionId: sid,
  })
  if (!admitted.ok) {
    return { ok: false, error: admitted.error }
  }

  return {
    ok: true,
    traceId: admitted.envelope.traceId,
    origin: admitted.envelope.origin,
    checkpoints: platform.checkpoint.list(sid),
  }
}
