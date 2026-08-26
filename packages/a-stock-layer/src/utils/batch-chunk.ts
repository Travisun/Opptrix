/**
 * 大批量行情分片与有界并发 — Provider / Engine batchRealtime 共用。
 */

/** 默认分片大小（Engine 与 Tickflow postQuotes） */
export const BATCH_REALTIME_CHUNK = 100

/** 同花顺 snapshot / Zzshare rt_k 更保守的片长 */
export const BATCH_REALTIME_CHUNK_CONSERVATIVE = 80

/** 片间默认并发 */
export const BATCH_REALTIME_CONCURRENCY = 2

/** Engine 层片间并发上限 */
export const BATCH_REALTIME_ENGINE_CONCURRENCY = 3

/** 免费档 / ETF 逐标的有界并发 */
export const BATCH_REALTIME_ITEM_CONCURRENCY = 5

export function chunkArray<T>(items: T[], size: number): T[][] {
  const n = Math.max(1, Math.floor(size))
  const out: T[][] = []
  for (let i = 0; i < items.length; i += n) out.push(items.slice(i, i + n))
  return out
}

/**
 * 有界并发映射；单任务抛错由调用方在 fn 内吞掉或自行处理。
 */
export async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (!items.length) return []
  const limit = Math.min(Math.max(1, concurrency), items.length)
  const results: R[] = new Array(items.length)
  let next = 0

  async function worker(): Promise<void> {
    while (next < items.length) {
      const i = next++
      results[i] = await fn(items[i] as T, i)
    }
  }

  await Promise.all(Array.from({ length: limit }, () => worker()))
  return results
}
