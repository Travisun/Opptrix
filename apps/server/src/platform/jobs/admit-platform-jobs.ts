import type { PlatformContext, PlatformJobSnapshot } from '../types.js'

/**
 * Readonly diagnostic: Ingress admit → jobs.list() + jobsListed.
 * Proves Ingress ⊥ Inference (no chat / no gate submit / no cancel).
 * Optional sessionId is forwarded to admit; passed to list() only when the
 * facade accepts a filter (today list takes no args — extra arg is ignored).
 */
export function admitPlatformJobs(
  platform: Pick<PlatformContext, 'ingress' | 'jobs' | 'info'>,
  opts?: { origin?: string; sessionId?: string },
):
  | {
      ok: true
      traceId: string
      origin: string
      jobs: PlatformJobSnapshot[]
      jobsListed: number
    }
  | { ok: false; error: string } {
  const origin =
    typeof opts?.origin === 'string' && opts.origin.trim()
      ? opts.origin.trim()
      : 'web.diagnostic'

  const sessionId =
    typeof opts?.sessionId === 'string' ? opts.sessionId.trim() : ''

  const admitRaw: { text: string; sessionId?: string } = {
    text: 'platform.jobs',
  }
  if (sessionId) {
    admitRaw.sessionId = sessionId
  }

  const admitted = platform.ingress.admit(origin, admitRaw)
  if (!admitted.ok) {
    return { ok: false, error: admitted.error }
  }

  const listFn = platform.jobs.list as {
    (filter?: { sessionId?: string }): PlatformJobSnapshot[]
  }
  const jobs = sessionId ? listFn({ sessionId }) : listFn()

  return {
    ok: true,
    traceId: admitted.envelope.traceId,
    origin: admitted.envelope.origin,
    jobs,
    jobsListed: platform.info().jobsListed,
  }
}
