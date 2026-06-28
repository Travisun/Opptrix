export async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  delayMs: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let next = 0

  async function worker() {
    while (next < items.length) {
      const i = next++
      results[i] = await fn(items[i], i)
      if (delayMs > 0 && i < items.length - 1) {
        await sleep(delayMs)
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker())
  await Promise.all(workers)
  return results
}

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  attempts = 3,
  baseDelayMs = 400,
): Promise<T> {
  let last: unknown
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn()
    } catch (e) {
      last = e
      if (i < attempts - 1) await sleep(baseDelayMs * (i + 1))
    }
  }
  throw last
}
