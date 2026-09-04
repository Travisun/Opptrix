import type { PlatformContext } from '../types.js'
import type { Envelope } from './types.js'
import { admitJobWake } from './admit-job-wake.js'

/**
 * Admit `job.wake` then push onto the platform wake ring (best-effort observability).
 * Does not start chat / TurnWake resume — Ingress ⊥ Inference.
 */
export function admitAndRememberJobWake(
  platform: Pick<PlatformContext, 'ingress' | 'rememberJobWake'>,
  raw: { sessionId: string; text?: string; jobId?: string },
):
  | { ok: true; traceId: string; envelope: Envelope }
  | { ok: false; error: string } {
  const result = admitJobWake(platform, raw)
  if (!result.ok) return result

  const sessionId =
    typeof result.envelope.sessionId === 'string' && result.envelope.sessionId.trim()
      ? result.envelope.sessionId.trim()
      : String(raw.sessionId ?? '').trim()

  platform.rememberJobWake({
    traceId: result.traceId,
    sessionId,
    ...(result.envelope.jobId ? { jobId: result.envelope.jobId } : {}),
    at: new Date().toISOString(),
    origin: result.envelope.origin,
  })

  return result
}
