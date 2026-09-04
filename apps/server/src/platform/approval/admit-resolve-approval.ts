import type { PlatformContext } from '../types.js'

/**
 * Diagnostic: Ingress admit → approval.resolve(id, decision) + approvalsPending.
 * Proves Ingress ⊥ Inference (no chat / no gate submit).
 * Soft UserPrompt mirror (Wave 50A) may run inside queue.resolve when bound — fail-open.
 * Unknown or already-resolved id returns ok with resolved=false (mirrors queue).
 * C1: when opts.sessionId is set and a pending row exists with a different sessionId →
 * ok:false `session_mismatch` (does not resolve).
 */
export function admitResolveApproval(
  platform: Pick<PlatformContext, 'ingress' | 'approval' | 'info'>,
  id: string,
  decision: { approved: boolean; note?: string },
  opts?: { origin?: string; sessionId?: string },
):
  | {
      ok: true
      traceId: string
      origin: string
      resolved: boolean
      approvalsPending: number
    }
  | { ok: false; error: string } {
  const key = typeof id === 'string' ? id.trim() : ''
  if (!key) {
    return { ok: false, error: 'id required' }
  }

  if (typeof decision?.approved !== 'boolean') {
    return { ok: false, error: 'approved required' }
  }

  const origin =
    typeof opts?.origin === 'string' && opts.origin.trim()
      ? opts.origin.trim()
      : 'web.diagnostic'

  const sessionId =
    typeof opts?.sessionId === 'string' ? opts.sessionId.trim() : ''

  const admitted = platform.ingress.admit(origin, {
    text: 'platform.approvals.resolve',
    ...(sessionId ? { sessionId } : {}),
  })
  if (!admitted.ok) {
    return { ok: false, error: admitted.error }
  }

  if (sessionId) {
    const pending = platform.approval.list()
    const row = pending.find((r) => r.id === key)
    if (row && row.sessionId !== sessionId) {
      return { ok: false, error: 'session_mismatch' }
    }
  }

  const resolved = platform.approval.resolve(
    key,
    {
      approved: decision.approved,
      ...(typeof decision.note === 'string' ? { note: decision.note } : {}),
    },
    sessionId ? { sessionId } : undefined,
  )

  return {
    ok: true,
    traceId: admitted.envelope.traceId,
    origin: admitted.envelope.origin,
    resolved,
    approvalsPending: platform.info().approvalsPending,
  }
}
