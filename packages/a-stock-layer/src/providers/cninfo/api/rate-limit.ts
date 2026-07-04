import { sleep } from '../../../utils/http.js'

/** Minimum gap between consecutive cninfo requests (compliant substitute browsing). */
export const CNINFO_MIN_INTERVAL_MS = 2000

let chain: Promise<unknown> = Promise.resolve()
let lastRequestAt = 0

/**
 * Serialize all cninfo HTTP calls: no concurrency, at most one request per 2s.
 */
export function cninfoThrottle<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(async () => {
    const now = Date.now()
    const waitMs = Math.max(0, CNINFO_MIN_INTERVAL_MS - (now - lastRequestAt))
    if (waitMs > 0) await sleep(waitMs)
    lastRequestAt = Date.now()
    return fn()
  })
  chain = run.then(
    () => undefined,
    () => undefined,
  )
  return run
}

/** Test helper — reset gate between unit tests. */
export function resetCninfoThrottleForTests(): void {
  chain = Promise.resolve()
  lastRequestAt = 0
}
