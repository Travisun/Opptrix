import type { PlatformContext } from '../types.js'
import type { Envelope } from './types.js'

/**
 * Admit a `job.wake` envelope (no chat / no TurnWake resume).
 * Requires non-empty sessionId; optionally attaches jobId onto the envelope.
 */
export function admitJobWake(
  platform: Pick<PlatformContext, 'ingress'>,
  raw: { sessionId: string; text?: string; jobId?: string },
):
  | { ok: true; traceId: string; envelope: Envelope }
  | { ok: false; error: string } {
  const sessionId = typeof raw.sessionId === 'string' ? raw.sessionId.trim() : ''
  if (!sessionId) {
    return { ok: false, error: 'sessionId required' }
  }

  const textRaw = typeof raw.text === 'string' ? raw.text.trim() : ''
  const admitted = platform.ingress.admit('job.wake', {
    text: textRaw || 'job.wake',
    sessionId,
  })
  if (!admitted.ok) {
    return { ok: false, error: admitted.error }
  }

  const envelope: Envelope = { ...admitted.envelope }
  const jobId = typeof raw.jobId === 'string' ? raw.jobId.trim() : ''
  if (jobId) {
    envelope.jobId = jobId
  }

  return {
    ok: true,
    traceId: envelope.traceId,
    envelope,
  }
}
