import { fetchCommunityFeed } from '../../api/client'
import type { CommunityFeedKind, CommunityFeedResponse } from '../../types/schemas'

/** 与服务端代理缓存对齐：2 小时内复用，到期后台刷新 */
export const COMMUNITY_FEED_CACHE_TTL_MS = 2 * 60 * 60 * 1000

/** 数据结构变更时递增，使旧内存缓存失效 */
export const COMMUNITY_FEED_CACHE_SCHEMA = 3

export const COMMUNITY_FEED_KINDS: readonly CommunityFeedKind[] = [
  'latest',
  'hot',
  'research_strategy',
  'lounge',
] as const

type CacheEntry = {
  data: CommunityFeedResponse
  cachedAt: number
  schema: number
}

const cache = new Map<CommunityFeedKind, CacheEntry>()
const inflight = new Map<CommunityFeedKind, Promise<CommunityFeedResponse>>()
const listeners = new Set<() => void>()

let refreshTimer: ReturnType<typeof setInterval> | null = null

function notifyListeners(): void {
  for (const listener of listeners) {
    listener()
  }
}

function isValidEntry(entry: CacheEntry | undefined, now = Date.now()): entry is CacheEntry {
  if (!entry) return false
  if (entry.schema !== COMMUNITY_FEED_CACHE_SCHEMA) return false
  return now - entry.cachedAt < COMMUNITY_FEED_CACHE_TTL_MS
}

export function subscribeCommunityFeedCache(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function getCommunityFeedCacheEntry(kind: CommunityFeedKind): CacheEntry | null {
  const entry = cache.get(kind)
  return isValidEntry(entry) ? entry : null
}

export function isCommunityFeedCacheFresh(kind: CommunityFeedKind, now = Date.now()): boolean {
  return isValidEntry(cache.get(kind), now)
}

async function fetchAndStore(kind: CommunityFeedKind): Promise<CommunityFeedResponse> {
  const pending = inflight.get(kind)
  if (pending) return pending

  const staleEntry = cache.get(kind)

  const promise = fetchCommunityFeed(kind, 0)
    .then((data) => {
      cache.set(kind, {
        data,
        cachedAt: Date.now(),
        schema: COMMUNITY_FEED_CACHE_SCHEMA,
      })
      inflight.delete(kind)
      notifyListeners()
      return data
    })
    .catch((err: unknown) => {
      inflight.delete(kind)
      if (staleEntry?.data) {
        return staleEntry.data
      }
      throw err
    })

  inflight.set(kind, promise)
  return promise
}

export async function loadCommunityFeedCached(
  kind: CommunityFeedKind,
  opts?: { force?: boolean },
): Promise<CommunityFeedResponse> {
  const entry = getCommunityFeedCacheEntry(kind)
  if (!opts?.force && entry) {
    return entry.data
  }
  return fetchAndStore(kind)
}

export function preloadCommunityFeeds(opts?: { force?: boolean }): void {
  for (const kind of COMMUNITY_FEED_KINDS) {
    if (!opts?.force && isCommunityFeedCacheFresh(kind)) continue
    void fetchAndStore(kind).catch(() => {})
  }
}

/** App 启动且后端可用后调用：立即预拉全部分类，并每 2 小时后台刷新 */
export function startCommunityFeedBackgroundRefresh(): () => void {
  preloadCommunityFeeds()

  if (refreshTimer) {
    clearInterval(refreshTimer)
  }

  refreshTimer = setInterval(() => {
    preloadCommunityFeeds({ force: true })
  }, COMMUNITY_FEED_CACHE_TTL_MS)

  return () => {
    if (refreshTimer) {
      clearInterval(refreshTimer)
      refreshTimer = null
    }
  }
}

export function invalidateCommunityFeedCache(kind?: CommunityFeedKind): void {
  if (kind) {
    cache.delete(kind)
  } else {
    cache.clear()
  }
  notifyListeners()
}
