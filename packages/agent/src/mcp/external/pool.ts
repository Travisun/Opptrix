/**
 * 外部 MCP hydrate 有界并发（与行情 L1 hydrate 的 mapPool 同构，避免 agent→market-data 依赖）。
 */

const DEFAULT_MCP_HYDRATE_CONCURRENCY = 2
const MAX_MCP_HYDRATE_CONCURRENCY = 3

/**
 * 外部 MCP `doHydrate` 跨 server 并发：默认 2；`OPPTRIX_MCP_HYDRATE_CONCURRENCY` 可覆盖，上限 3。
 */
export function resolveMcpHydrateConcurrency(): number {
  const raw = process.env.OPPTRIX_MCP_HYDRATE_CONCURRENCY
  if (raw != null && String(raw).trim() !== '') {
    const n = Number.parseInt(String(raw).trim(), 10)
    if (Number.isFinite(n) && n >= 1) {
      return Math.min(MAX_MCP_HYDRATE_CONCURRENCY, Math.floor(n))
    }
  }
  return DEFAULT_MCP_HYDRATE_CONCURRENCY
}

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
      results[i] = await fn(items[i] as T, i)
      if (delayMs > 0 && i < items.length - 1) {
        await new Promise<void>(resolve => setTimeout(resolve, delayMs))
      }
    }
  }

  const workers = Array.from(
    { length: Math.min(Math.max(1, concurrency), Math.max(items.length, 1)) },
    () => worker(),
  )
  if (items.length === 0) return results
  await Promise.all(workers)
  return results
}
