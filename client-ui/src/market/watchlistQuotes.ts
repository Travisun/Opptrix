/** 右侧关注列表行情批量刷新间隔（非实时） */
export const WATCHLIST_QUOTES_POLL_MS = 60_000

/** 大批量关注列表：每批请求标的数（与 UI 渐进刷新一致） */
export const WATCHLIST_QUOTE_CHUNK_SIZE = 40

/** 批间有界并发：同时进行的 instrumentQuotes 批次数 */
export const WATCHLIST_QUOTE_CHUNK_CONCURRENCY = 2

import type { QuoteFailedReason } from './instrument-adapters'
import type { MarketQuote } from '../types/market'

/** 关注列表一次刷新：merge 报价；失败项不抹掉已有价 */
export function mergeWatchlistQuoteRefresh(input: {
  prevQuotes: Record<string, MarketQuote>
  prevFailed: Record<string, QuoteFailedReason>
  patch: Record<string, MarketQuote>
  failedMap: Record<string, QuoteFailedReason>
}): {
  quotes: Record<string, MarketQuote>
  failedByKey: Record<string, QuoteFailedReason>
} {
  const quotes = { ...input.prevQuotes, ...input.patch }
  const failedByKey = { ...input.prevFailed }
  for (const key of Object.keys(input.patch)) {
    delete failedByKey[key]
  }
  for (const [key, reason] of Object.entries(input.failedMap)) {
    if (!(key in input.patch)) {
      failedByKey[key] = reason
    }
  }
  return { quotes, failedByKey }
}

export type WatchlistBoardQuoteRow = {
  key: string
  code: string
  name: string
  market: string
  price: number | null
  changePct: number | null
}

/** 看板关注条：未返回的项保留上一帧价格，勿写成 null */
export function mergeWatchlistBoardQuoteRows(
  items: Array<{ key: string; code: string; name: string; market: string }>,
  prev: WatchlistBoardQuoteRow[],
  incoming: Map<string, WatchlistBoardQuoteRow>,
): WatchlistBoardQuoteRow[] {
  const prevByKey = new Map(prev.map(row => [row.key, row]))
  return items.map(item => {
    const hit = incoming.get(item.key)
    if (hit) return hit
    const cached = prevByKey.get(item.key)
    if (cached) return cached
    return {
      key: item.key,
      code: item.code,
      name: item.name,
      market: item.market,
      price: null,
      changePct: null,
    }
  })
}

/** 将标的列表切成固定大小的批（末批可更短） */
export function chunkWatchlistInstruments<T>(
  items: T[],
  chunkSize: number = WATCHLIST_QUOTE_CHUNK_SIZE,
): T[][] {
  const size = Math.max(1, Math.floor(chunkSize))
  if (!items.length) return []
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size))
  }
  return out
}

export type RunWatchlistQuoteBatchesResult = {
  batchCount: number
  okCount: number
  failCount: number
}

/** runBatch 因中止提前退出时抛出；helper 不计 ok/fail */
export class WatchlistQuoteBatchAbortError extends Error {
  override readonly name = 'WatchlistQuoteBatchAbortError'
  constructor() {
    super('watchlist_quote_batch_aborted')
  }
}

export function isWatchlistQuoteBatchAbortError(err: unknown): boolean {
  return err instanceof WatchlistQuoteBatchAbortError
}

/** 从 Hub message 归类单批软失败 reason（产品行态用） */
export function classifyWatchlistBatchFailReason(message?: string): QuoteFailedReason {
  const raw = String(message ?? '')
  if (/not found|未收录|找不到/i.test(raw)) return 'not_found'
  if (/不支持|unsupported/i.test(raw)) return 'unsupported'
  if (/没有可用|未配置|no[_\s]?provider|暂无.*源|未启用/i.test(raw)) return 'no_provider'
  if (/空|empty|无行情|暂无数据/i.test(raw)) return 'empty'
  return 'error'
}

/**
 * 有界并发跑多批行情请求。
 * 每批独立成功/失败：一批抛错不影响其它批；调用方在 runBatch 内立刻 merge。
 * AbortError / shouldAbort 提前退出不计 ok/fail。
 */
export async function runWatchlistQuoteBatches<T>(input: {
  items: T[]
  chunkSize?: number
  concurrency?: number
  runBatch: (chunk: T[], batchIndex: number) => Promise<void>
  onBatchError?: (error: unknown, batchIndex: number) => void
  shouldAbort?: () => boolean
}): Promise<RunWatchlistQuoteBatchesResult> {
  const chunks = chunkWatchlistInstruments(
    input.items,
    input.chunkSize ?? WATCHLIST_QUOTE_CHUNK_SIZE,
  )
  const batchCount = chunks.length
  if (!batchCount) {
    return { batchCount: 0, okCount: 0, failCount: 0 }
  }

  const concurrency = Math.max(
    1,
    Math.floor(input.concurrency ?? WATCHLIST_QUOTE_CHUNK_CONCURRENCY),
  )
  let nextIndex = 0
  let okCount = 0
  let failCount = 0

  async function worker(): Promise<void> {
    while (true) {
      if (input.shouldAbort?.()) return
      const batchIndex = nextIndex
      nextIndex += 1
      if (batchIndex >= chunks.length) return
      const chunk = chunks[batchIndex]
      try {
        await input.runBatch(chunk, batchIndex)
        okCount += 1
      } catch (err) {
        // 中止：不计 ok/fail；其它错误计 fail
        if (isWatchlistQuoteBatchAbortError(err)) return
        if (input.shouldAbort?.()) return
        failCount += 1
        input.onBatchError?.(err, batchIndex)
      }
    }
  }

  const workerCount = Math.min(concurrency, batchCount)
  await Promise.all(Array.from({ length: workerCount }, () => worker()))
  return { batchCount, okCount, failCount }
}
