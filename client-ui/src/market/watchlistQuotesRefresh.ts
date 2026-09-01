import {
  UI_CACHE_TTL_MS,
  decideRevalidate,
  resolveFetchedAtMs,
} from '@opptrix/shared'
import { readWatchlistQuotesSessionCache } from './rightPanelSessionCache'

/** 跨组件（右栏关注 / 市场动态看板）共享的上次成功拉取时间，避免重复打 Hub */
let lastSuccessAtMs = 0
let inflight: Promise<void> | null = null

function bootLastSuccessFromSession(): number {
  const cached = readWatchlistQuotesSessionCache()
  return cached?.cached_at_ms ?? 0
}

if (typeof window !== 'undefined') {
  lastSuccessAtMs = bootLastSuccessFromSession()
}

export function getWatchlistQuotesLastFetchedAtMs(): number {
  return lastSuccessAtMs
}

export function markWatchlistQuotesFetched(
  cachedAtMs?: number,
  refreshedAtIso?: string | null,
): void {
  lastSuccessAtMs = resolveFetchedAtMs(cachedAtMs ?? Date.now(), refreshedAtIso)
}

export type WatchlistQuotesRefreshResult = 'skipped' | 'inflight' | 'done'

/** 在 TTL 内跳过；否则执行 fetcher（单 inflight 合并）。 */
export async function runWatchlistQuotesRefreshIfNeeded(
  fetcher: () => Promise<void>,
  opts?: { force?: boolean; hasDisplayedData?: boolean },
): Promise<WatchlistQuotesRefreshResult> {
  const hasDisplayed = opts?.hasDisplayedData ?? lastSuccessAtMs > 0
  const mode = decideRevalidate({
    cachedAtMs: lastSuccessAtMs,
    ttlMs: UI_CACHE_TTL_MS.watchlistQuotes,
    force: opts?.force,
    hasDisplayedData: hasDisplayed,
  })
  if (mode === 'skip') return 'skipped'

  if (inflight) {
    await inflight
    return 'inflight'
  }

  inflight = fetcher().finally(() => {
    inflight = null
  })

  await inflight
  return 'done'
}

/** 轮询 tick：仅在 TTL 过期时返回 true */
export function shouldPollWatchlistQuotesAt(now = Date.now()): boolean {
  return decideRevalidate({
    cachedAtMs: lastSuccessAtMs,
    ttlMs: UI_CACHE_TTL_MS.watchlistQuotes,
    hasDisplayedData: lastSuccessAtMs > 0,
    now,
  }) !== 'skip'
}
