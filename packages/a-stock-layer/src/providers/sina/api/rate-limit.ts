import { sleep } from '../../../utils/http.js'

/** Minimum gap between consecutive sina requests (compliant substitute browsing). */
export const SINA_MIN_INTERVAL_MS = 2000

let chain: Promise<unknown> = Promise.resolve()
let lastRequestAt = 0

/** Serialize all sina HTTP calls: no concurrency, at most one request per 2s. */
export function sinaThrottle<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(async () => {
    const now = Date.now()
    const waitMs = Math.max(0, SINA_MIN_INTERVAL_MS - (now - lastRequestAt))
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

export function resetSinaThrottleForTests(): void {
  chain = Promise.resolve()
  lastRequestAt = 0
}
