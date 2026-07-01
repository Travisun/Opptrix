import { useCallback, useEffect, useSyncExternalStore } from 'react'
import {
  ensureNewsFeedBootstrapped,
  getNewsFeedSnapshot,
  getSelectedArticle,
  loadMoreNewsFeed,
  NEWS_PAGE_SIZE,
  NEWS_PRELOAD_THRESHOLD,
  refreshNewsFeed,
  reloadNewsFeed,
  setNewsFeedGroupFilter,
  setNewsFeedSelectedId,
  setNewsFeedSourceFilter,
  setNewsFeedTimelineDate,
  setNewsFeedView,
  subscribeNewsFeed,
  type NewsFeedRefreshResult,
  type NewsListView,
} from './newsFeedSession'

export { type NewsListView, NEWS_PAGE_SIZE, NEWS_PRELOAD_THRESHOLD }

export function useNewsFeed() {
  const snap = useSyncExternalStore(
    subscribeNewsFeed,
    getNewsFeedSnapshot,
    getNewsFeedSnapshot,
  )

  useEffect(() => {
    ensureNewsFeedBootstrapped()
  }, [])

  const changeView = useCallback((next: NewsListView) => {
    setNewsFeedView(next)
  }, [])

  const loadMore = useCallback(async () => {
    await loadMoreNewsFeed()
  }, [])

  const refresh = useCallback(async (): Promise<NewsFeedRefreshResult> => {
    return refreshNewsFeed()
  }, [])

  const reload = useCallback(async () => {
    await reloadNewsFeed()
  }, [])

  const setTimelineDate = useCallback(async (date: string | null) => {
    await setNewsFeedTimelineDate(date)
  }, [])

  const setGroupFilter = useCallback((groupId: string) => {
    setNewsFeedGroupFilter(groupId)
  }, [])

  const setSourceFilter = useCallback((subscriptionId: string) => {
    setNewsFeedSourceFilter(subscriptionId)
  }, [])

  const listReady = snap.hydrated || (
    snap.view === 'timeline'
      ? snap.articles.length > 0
      : snap.grouped != null
  )

  return {
    articles: snap.articles,
    grouped: snap.grouped,
    subscriptions: snap.subscriptions,
    groups: snap.groups,
    loading: snap.initializing && !listReady,
    listSyncing: snap.listSyncing,
    loadingMore: snap.loadingMore,
    refreshing: snap.refreshing,
    listPulseEpoch: snap.listPulseEpoch,
    error: snap.error,
    refreshedAt: snap.refreshedAt,
    selectedId: snap.selectedId,
    selected: getSelectedArticle(),
    hasMore: snap.hasMore,
    total: snap.total,
    view: snap.view,
    timelineDate: snap.timelineDate,
    groupFilterId: snap.groupFilterId,
    sourceFilterId: snap.sourceFilterId,
    hydrated: snap.hydrated,
    setSelectedId: setNewsFeedSelectedId,
    setView: changeView,
    setTimelineDate,
    setGroupFilter,
    setSourceFilter,
    loadMore,
    refresh,
    reload,
  }
}
