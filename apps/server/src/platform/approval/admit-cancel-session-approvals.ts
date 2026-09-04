import type { PlatformContext } from '../types.js'

/**
 * Diagnostic: Ingress admit → approval.cancelSession(sessionId) + approvalsPending.
 * Proves Ingress ⊥ Inference (no chat / no gate submit / no ask_user bridge).
 * Empty sessionId soft-fails; cancel count 0 when no pending for session.
 */
export function admitCancelSessionApprovals(
  platform: Pick<PlatformContext, 'ingress' | 'approval' | 'info'>,
  sessionId: string,
  opts?: { origin?: string },
):
  | {
      ok: true
      traceId: string
      origin: string
      cancelled: number
      approvalsPending: number
    }
  | { ok: false; error: string } {
  const sid = typeof sessionId === 'string' ? sessionId.trim() : ''
  if (!sid) {
    return { ok: false, error: 'sessionId required' }
  }

  const origin =
    typeof opts?.origin === 'string' && opts.origin.trim()
      ? opts.origin.trim()
      : 'web.diagnostic'

  const admitted = platform.ingress.admit(origin, {
    text: 'platform.approvals.cancelSession',
    sessionId: sid,
  })
  if (!admitted.ok) {
    return { ok: false, error: admitted.error }
  }

  const cancelled = platform.approval.cancelSession(sid)

  return {
    ok: true,
    traceId: admitted.envelope.traceId,
    origin: admitted.envelope.origin,
    cancelled,
    approvalsPending: platform.info().approvalsPending,
  }
}
