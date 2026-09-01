import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { fetchCommunityFeed } from '../../api/client'
import type { CommunityFeedKind, CommunityFeedResponse, CommunityTopic } from '../../types/schemas'
import {
  acquireCommunityFeedPagePolling,
  getCommunityFeedCacheEntry,
  invalidateCommunityFeedCache,
  isCommunityFeedCacheFresh,
  loadCommunityFeedCached,
  releaseCommunityFeedPagePolling,
  subscribeCommunityFeedCache,
} from './communityFeedCache'
import { persistCommunityFeedKind, readStoredCommunityFeedKind } from './communityFeedMeta'

const CATEGORY_MISSING_LABELS: Partial<Record<CommunityFeedKind, string>> = {
  research_strategy: '投研策略',
  lounge: '茶馆闲聊',
}

function formatFeedError(res: CommunityFeedResponse | null): string {
  if (!res || res.success) return ''
  if (res.error === 'community_category_missing' || res.error === 'community_strategy_category_missing') {
    const label = CATEGORY_MISSING_LABELS[res.kind] ?? '该板块'
    return `暂时找不到${label}，请稍后再试`
  }
  return '暂时无法加载社区内容，请检查网络后重试'
}

function readCachedFeed(kind: CommunityFeedKind): CommunityFeedResponse | null {
  return getCommunityFeedCacheEntry(kind)?.data ?? null
}

function mergeTopics(existing: CommunityTopic[], next: CommunityTopic[]): CommunityTopic[] {
  if (next.length === 0) return existing
  const seen = new Set(existing.map(t => t.id))
  const merged = [...existing]
  for (const topic of next) {
    if (seen.has(topic.id)) continue
    seen.add(topic.id)
    merged.push(topic)
  }
  return merged
}

function applyPageZero(res: CommunityFeedResponse): {
  topics: CommunityTopic[]
  page: number
  hasMore: boolean
} {
  return {
    topics: res.topics,
    page: res.page ?? 0,
    hasMore: res.hasMore ?? false,
  }
}

export function useCommunityFeed(pageActive: boolean, initialKind?: CommunityFeedKind) {
  const [kind, setKindState] = useState<CommunityFeedKind>(
    () => initialKind ?? readStoredCommunityFeedKind(),
  )
  const cachedInitial = readCachedFeed(kind)
  const initialPage = cachedInitial ? applyPageZero(cachedInitial) : null

  const [topics, setTopics] = useState<CommunityTopic[]>(() => initialPage?.topics ?? [])
  const [page, setPage] = useState(() => initialPage?.page ?? 0)
  const [hasMore, setHasMore] = useState(() => initialPage?.hasMore ?? false)
  const [fetchedAt, setFetchedAt] = useState<string | null>(() => cachedInitial?.fetchedAt ?? null)
  const [loading, setLoading] = useState(() => !isCommunityFeedCacheFresh(kind))
  const [refreshing, setRefreshing] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState(() => formatFeedError(cachedInitial))
  const [loadMoreError, setLoadMoreError] = useState('')
  const [staleHint, setStaleHint] = useState('')
  const requestIdRef = useRef(0)
  const loadMoreIdRef = useRef(0)
  const kindRef = useRef(kind)
  kindRef.current = kind

  const cacheVersion = useSyncExternalStore(
    subscribeCommunityFeedCache,
    () => getCommunityFeedCacheEntry(kind)?.cachedAt ?? 0,
    () => 0,
  )

  useEffect(() => {
    const cached = readCachedFeed(kind)
    if (cached) {
      const next = applyPageZero(cached)
      setTopics(next.topics)
      setPage(next.page)
      setHasMore(next.hasMore)
      setFetchedAt(cached.fetchedAt)
      setError(formatFeedError(cached))
      setLoadMoreError('')
      if (isCommunityFeedCacheFresh(kind)) {
        setLoading(false)
        setRefreshing(false)
      }
    }
  }, [kind, cacheVersion])

  const load = useCallback(async (nextKind: CommunityFeedKind, refresh = false) => {
    const requestId = requestIdRef.current + 1
    requestIdRef.current = requestId

    const cached = readCachedFeed(nextKind)
    const hasFreshCache = !refresh && isCommunityFeedCacheFresh(nextKind) && cached

    if (hasFreshCache) {
      const next = applyPageZero(cached)
      setTopics(next.topics)
      setPage(next.page)
      setHasMore(next.hasMore)
      setFetchedAt(cached.fetchedAt)
      setError(formatFeedError(cached))
      setLoadMoreError('')
      setStaleHint('')
      setLoading(false)
      setRefreshing(false)
      return
    }

    if (refresh) {
      setRefreshing(true)
      invalidateCommunityFeedCache(nextKind)
    } else if (!cached) {
      setLoading(true)
    } else if (cached) {
      setRefreshing(true)
    }

    if (!refresh) setError('')
    setLoadMoreError('')
    setStaleHint('')

    try {
      const res = await loadCommunityFeedCached(nextKind, { force: refresh })
      if (requestIdRef.current !== requestId) return
      const next = applyPageZero(res)
      setTopics(next.topics)
      setPage(next.page)
      setHasMore(next.hasMore)
      setFetchedAt(res.fetchedAt)
      setError(formatFeedError(res))
      setStaleHint('')
    } catch {
      if (requestIdRef.current !== requestId) return
      if (cached) {
        const next = applyPageZero(cached)
        setTopics(next.topics)
        setPage(next.page)
        setHasMore(next.hasMore)
        setFetchedAt(cached.fetchedAt)
        setStaleHint('网络不稳定，暂时显示上次加载的内容')
        setError('')
      } else {
        setTopics([])
        setPage(0)
        setHasMore(false)
        setFetchedAt(null)
        setError('暂时无法加载社区内容，请检查网络后重试')
      }
    } finally {
      if (requestIdRef.current === requestId) {
        setLoading(false)
        setRefreshing(false)
      }
    }
  }, [])

  useEffect(() => {
    if (!pageActive) return undefined
    const tick = () => { void load(kindRef.current, false) }
    acquireCommunityFeedPagePolling(tick)
    return releaseCommunityFeedPagePolling
  }, [pageActive, load])

  const refresh = useCallback(() => {
    void load(kind, true)
  }, [kind, load])

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore || loading || refreshing) return

    const requestId = loadMoreIdRef.current + 1
    loadMoreIdRef.current = requestId
    setLoadingMore(true)
    setLoadMoreError('')

    const nextPage = page + 1
    try {
      const res = await fetchCommunityFeed(kind, nextPage)
      if (loadMoreIdRef.current !== requestId) return
      if (!res.success) {
        setLoadMoreError('暂时无法加载更多，请稍后重试')
        return
      }
      setTopics(prev => mergeTopics(prev, res.topics))
      setPage(res.page ?? nextPage)
      setHasMore(res.hasMore ?? false)
    } catch {
      if (loadMoreIdRef.current !== requestId) return
      setLoadMoreError('暂时无法加载更多，请稍后重试')
    } finally {
      if (loadMoreIdRef.current === requestId) {
        setLoadingMore(false)
      }
    }
  }, [hasMore, kind, loading, loadingMore, page, refreshing])

  const setKind = useCallback((next: CommunityFeedKind) => {
    persistCommunityFeedKind(next)
    setKindState(next)
    setLoadMoreError('')
  }, [])

  return {
    kind,
    setKind,
    topics,
    fetchedAt,
    loading,
    refreshing,
    loadingMore,
    hasMore,
    error,
    loadMoreError,
    staleHint,
    refresh,
    loadMore,
  }
}
