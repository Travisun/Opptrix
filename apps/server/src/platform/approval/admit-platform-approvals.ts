import type { PlatformContext } from '../types.js'
import type { ApprovalRequest } from './types.js'

/**
 * Readonly diagnostic: Ingress admit → approval.list(sessionId) + approvalsPending.
 * Proves Ingress ⊥ Inference (no chat / no gate submit / no resolve/cancel).
 *
 * C1 choice: sessionId is **required**. Without it → ok:false `sessionId required`
 * (no global pending dump).
 */
export function admitPlatformApprovals(
  platform: Pick<PlatformContext, 'ingress' | 'approval' | 'info'>,
  opts?: { origin?: string; sessionId?: string },
):
  | {
      ok: true
      traceId: string
      origin: string
      approvals: ApprovalRequest[]
      approvalsPending: number
    }
  | { ok: false; error: string } {
  const origin =
    typeof opts?.origin === 'string' && opts.origin.trim()
      ? opts.origin.trim()
      : 'web.diagnostic'

  const sessionId =
    typeof opts?.sessionId === 'string' ? opts.sessionId.trim() : ''

  if (!sessionId) {
    return { ok: false, error: 'sessionId required' }
  }

  const admitted = platform.ingress.admit(origin, {
    text: 'platform.approvals',
    sessionId,
  })
  if (!admitted.ok) {
    return { ok: false, error: admitted.error }
  }

  const approvals = platform.approval.list(sessionId)

  return {
    ok: true,
    traceId: admitted.envelope.traceId,
    origin: admitted.envelope.origin,
    approvals,
    approvalsPending: platform.info().approvalsPending,
  }
}
