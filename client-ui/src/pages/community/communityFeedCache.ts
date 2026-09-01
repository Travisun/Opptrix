import { fetchCommunityFeed } from '../../api/client'
import type { CommunityFeedKind, CommunityFeedResponse } from '../../types/schemas'
import {
  UI_CACHE_TTL_MS,
  UI_POLL_INTERVAL_MS,
  decideRevalidate,
} from '@opptrix/shared/ui-cache-policy'
import { createVisibilityPoller, type VisibilityPoller } from '../../data/cacheControl'

/** 数据结构变更时递增，使旧内存缓存失效 */
export const COMMUNITY_FEED_CACHE_SCHEMA = 3

export const COMMUNITY_FEED_KINDS: readonly CommunityFeedKind[] = [
  'latest',
  'hot',
  'research_strategy',
  'lounge',
] as const

/** @deprecated 使用 UI_CACHE_TTL_MS.communityFeed */
export const COMMUNITY_FEED_CACHE_TTL_MS = UI_CACHE_TTL_MS.communityFeed

type CacheEntry = {
  data: CommunityFeedResponse
  cachedAt: number
  schema: number
}

const cache = new Map<CommunityFeedKind, CacheEntry>()
const inflight = new Map<CommunityFeedKind, Promise<CommunityFeedResponse>>()
const listeners = new Set<() => void>()

let pagePollRefCount = 0
let pagePoller: VisibilityPoller | null = null
let pagePollTick: (() => void) | null = null

function notifyListeners(): void {
  for (const listener of listeners) {
    listener()
  }
}

function entryCachedAtMs(entry: CacheEntry | undefined): number | null {
  return entry?.cachedAt ?? null
}

function isEntryFresh(entry: CacheEntry | undefined, now = Date.now()): entry is CacheEntry {
  if (!entry) return false
  if (entry.schema !== COMMUNITY_FEED_CACHE_SCHEMA) return false
  return decideRevalidate({
    cachedAtMs: entry.cachedAt,
    ttlMs: UI_CACHE_TTL_MS.communityFeed,
    hasDisplayedData: true,
    now,
  }) === 'skip'
}

export function subscribeCommunityFeedCache(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function getCommunityFeedCacheEntry(kind: CommunityFeedKind): CacheEntry | null {
  const entry = cache.get(kind)
  return isEntryFresh(entry) ? entry : null
}

export function isCommunityFeedCacheFresh(kind: CommunityFeedKind, now = Date.now()): boolean {
  return isEntryFresh(cache.get(kind), now)
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
  const entry = cache.get(kind)
  const hasDisplayed = Boolean(entry?.data?.success && entry.data.topics.length > 0)
  const mode = decideRevalidate({
    cachedAtMs: entryCachedAtMs(entry),
    ttlMs: UI_CACHE_TTL_MS.communityFeed,
    force: opts?.force,
    hasDisplayedData: hasDisplayed,
  })
  if (mode === 'skip' && entry) {
    return entry.data
  }
  return fetchAndStore(kind)
}

export function preloadCommunityFeeds(opts?: { force?: boolean }): void {
  for (const kind of COMMUNITY_FEED_KINDS) {
    const entry = cache.get(kind)
    const mode = decideRevalidate({
      cachedAtMs: entryCachedAtMs(entry),
      ttlMs: UI_CACHE_TTL_MS.communityFeed,
      force: opts?.force,
      hasDisplayedData: Boolean(entry),
    })
    if (mode === 'skip') continue
    void fetchAndStore(kind).catch(() => {})
  }
}

function ensureCommunityPagePoller(): VisibilityPoller {
  if (!pagePoller) {
    pagePoller = createVisibilityPoller(UI_POLL_INTERVAL_MS.communityFeed, () => {
      pagePollTick?.()
    })
  }
  return pagePoller
}

/** 社区页可见时注册 tick；离开页面完全停止后台刷新 */
export function acquireCommunityFeedPagePolling(onTick: () => void): void {
  pagePollTick = onTick
  pagePollRefCount += 1
  if (pagePollRefCount === 1) {
    onTick()
    ensureCommunityPagePoller().acquire()
  }
}

export function releaseCommunityFeedPagePolling(): void {
  pagePollRefCount = Math.max(0, pagePollRefCount - 1)
  if (pagePollRefCount === 0) {
    pagePollTick = null
    ensureCommunityPagePoller().release()
  }
}

/** @deprecated 使用 acquireCommunityFeedPagePolling；不再在 App 启动时全量预拉 */
export function startCommunityFeedBackgroundRefresh(): () => void {
  return () => {
    releaseCommunityFeedPagePolling()
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
