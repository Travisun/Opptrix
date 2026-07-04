import { sleep } from '../../../utils/http.js'

/** Minimum gap between consecutive TDX protocol queries (substitute desktop client access). */
export const TDX_MIN_INTERVAL_MS = 2000

let chain: Promise<unknown> = Promise.resolve()
let lastRequestAt = 0

/** Serialize all TDX API calls: no concurrency, at most one query per 2s. */
export function tdxThrottle<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(async () => {
    const now = Date.now()
    const waitMs = Math.max(0, TDX_MIN_INTERVAL_MS - (now - lastRequestAt))
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

export function resetTdxThrottleForTests(): void {
  chain = Promise.resolve()
  lastRequestAt = 0
}
