import type { PlatformContext } from '../types.js'
import type { ApprovalRequest } from './types.js'

/**
 * Readonly diagnostic: Ingress admit → approval.list() + approvalsPending.
 * Proves Ingress ⊥ Inference (no chat / no gate submit / no resolve/cancel).
 * Optional sessionId is forwarded to admit and used as list() filter when set.
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

  const admitRaw: { text: string; sessionId?: string } = {
    text: 'platform.approvals',
  }
  if (sessionId) {
    admitRaw.sessionId = sessionId
  }

  const admitted = platform.ingress.admit(origin, admitRaw)
  if (!admitted.ok) {
    return { ok: false, error: admitted.error }
  }

  const approvals = sessionId
    ? platform.approval.list(sessionId)
    : platform.approval.list()

  return {
    ok: true,
    traceId: admitted.envelope.traceId,
    origin: admitted.envelope.origin,
    approvals,
    approvalsPending: platform.info().approvalsPending,
  }
}
