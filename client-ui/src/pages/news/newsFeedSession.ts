import { news } from '../../api/client'
import {
  decideRevalidate,
  resolveFetchedAtMs,
} from '@opptrix/shared'
import { createVisibilityPoller, type VisibilityPoller } from '../../data/cacheControl'
import {
  applyNewsFeedRefreshIntervalMin,
  getNewsFeedClientPollMs,
  getNewsFeedClientTtlMs,
  subscribeNewsFeedRefreshPolicy,
} from './newsFeedRefreshPolicy'
import type {
  FeedArticle,
  FeedGroup,
  FeedSubscription,
  NewsGroupedFeed,
} from '../../types/schemas'
import {
  applyArticlesMemoryCap,
  NEWS_ARTICLES_MEMORY_CAP,
} from './articlesMemoryCap'
import { dedupeArticlesByTitle } from './newsUtils'
import {
  buildGroupedFeedFallback,
  resolveGroupFilterId as resolveGroupFilter,
  resolveSourceFilterId as resolveSourceFilter,
} from './newsFeedFilters'

export type NewsListView = 'timeline' | 'group' | 'source'

export const NEWS_PAGE_SIZE = 20
export const NEWS_PRELOAD_THRESHOLD = 3
export { NEWS_ARTICLES_MEMORY_CAP }

export type NewsFeedSnapshot = {
  articles: FeedArticle[]
  grouped: NewsGroupedFeed | null
  /** 分组 / 来源视图：经 /news/feed 分页筛选，不依赖 grouped 大包 */
  filteredArticles: FeedArticle[]
  filteredCursor: string | null
  filteredHasMore: boolean
  filteredTotal: number
  subscriptions: FeedSubscription[]
  groups: FeedGroup[]
  refreshedAt: string | null
  hasMore: boolean
  /** Timeline hit in-memory window cap; further loadMore stopped. */
  listCapReached: boolean
  total: number
  cursor: string | null
  view: NewsListView
  selectedId: string | null
  timelineDate: string | null
  groupFilterId: string | null
  sourceFilterId: string | null
  hydrated: boolean
  initializing: boolean
  listSyncing: boolean
  loadingMore: boolean
  refreshing: boolean
  listPulseEpoch: number
  error: string
}

export type NewsFeedRefreshResult =
  | { ok: true }
  | { ok: false; message: string }

function emptySnapshot(): NewsFeedSnapshot {
  return {
    articles: [],
    grouped: null,
    filteredArticles: [],
    filteredCursor: null,
    filteredHasMore: false,
    filteredTotal: 0,
    subscriptions: [],
    groups: [],
    refreshedAt: null,
    hasMore: false,
    listCapReached: false,
    total: 0,
    cursor: null,
    view: 'timeline',
    selectedId: null,
    timelineDate: null,
    groupFilterId: null,
    sourceFilterId: null,
    hydrated: false,
    initializing: false,
    listSyncing: false,
    loadingMore: false,
    refreshing: false,
    listPulseEpoch: 0,
    error: '',
  }
}

let snapshot: NewsFeedSnapshot = emptySnapshot()
const listeners = new Set<() => void>()
let bootstrapped = false
let bootstrapPromise: Promise<void> | null = null
let softSyncPromise: Promise<void> | null = null
let lastSyncedAtMs = 0
let pagePollRefCount = 0
let pagePoller: VisibilityPoller | null = null
let refreshPolicyHydrated = false
let refreshPolicyPromise: Promise<void> | null = null

export {
  getNewsFeedClientPollMs,
  getNewsFeedClientTtlMs,
  subscribeNewsFeedRefreshPolicy,
} from './newsFeedRefreshPolicy'

function resetNewsPagePoller(): void {
  if (pagePoller) {
    pagePoller.dispose()
    pagePoller = null
  }
  if (pagePollRefCount > 0) {
    pagePoller = createVisibilityPoller(getNewsFeedClientPollMs(), () => {
      scheduleNewsFeedSync()
    })
    pagePoller.acquire()
  }
}

export function syncNewsFeedRefreshPolicy(refreshIntervalMin: unknown): void {
  if (!applyNewsFeedRefreshIntervalMin(refreshIntervalMin)) return
  resetNewsPagePoller()
}

export function ensureNewsFeedRefreshPolicyHydrated(): Promise<void> {
  if (refreshPolicyHydrated) return Promise.resolve()
  if (!refreshPolicyPromise) {
    refreshPolicyPromise = news.getSettings()
      .then(resp => {
        syncNewsFeedRefreshPolicy(resp.settings.refresh_interval_min)
        refreshPolicyHydrated = true
      })
      .catch(() => {
        refreshPolicyHydrated = true
      })
  }
  return refreshPolicyPromise
}

function markNewsFeedSynced(refreshedAt: string | null | undefined): void {
  lastSyncedAtMs = resolveFetchedAtMs(Date.now(), refreshedAt ?? null)
}

function ensureNewsPagePoller(): VisibilityPoller {
  if (!pagePoller) {
    pagePoller = createVisibilityPoller(getNewsFeedClientPollMs(), () => {
      scheduleNewsFeedSync()
    })
  }
  return pagePoller
}

function scheduleNewsFeedSync(opts?: { force?: boolean }): void {
  const hasDisplayed = snapshot.hydrated && snapshot.articles.length > 0
  const mode = decideRevalidate({
    cachedAtMs: lastSyncedAtMs,
    ttlMs: getNewsFeedClientTtlMs(),
    force: opts?.force,
    hasDisplayedData: hasDisplayed,
  })
  if (mode === 'skip') return
  if (!snapshot.hydrated) {
    void bootstrap()
    return
  }
  void softSync({ silent: hasDisplayed })
}

function emit() {
  for (const listener of listeners) listener()
}

function patch(partial: Partial<NewsFeedSnapshot>) {
  snapshot = { ...snapshot, ...partial }
  emit()
}

export function getNewsFeedSnapshot(): NewsFeedSnapshot {
  return snapshot
}

export function subscribeNewsFeed(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function findSelected(selectedId: string | null): FeedArticle | null {
  if (!selectedId) return null
  const fromTimeline = snapshot.articles.find(a => a.id === selectedId)
  if (fromTimeline) return fromTimeline
  const fromFiltered = snapshot.filteredArticles.find(a => a.id === selectedId)
  if (fromFiltered) return fromFiltered
  const grouped = snapshot.grouped
  if (!grouped) return null
  return grouped.groups.flatMap(g => g.articles).find(a => a.id === selectedId)
    ?? grouped.ungrouped.find(a => a.id === selectedId)
    ?? grouped.by_source.flatMap(s => s.articles).find(a => a.id === selectedId)
    ?? null
}

export function getSelectedArticle(): FeedArticle | null {
  return findSelected(snapshot.selectedId)
}

function normalizeListFilters() {
  const groupFilterId = resolveGroupFilter(
    snapshot.groups,
    snapshot.grouped,
    snapshot.groupFilterId,
  )
  const sourceFilterId = resolveSourceFilter(
    snapshot.subscriptions,
    snapshot.grouped,
    snapshot.sourceFilterId,
  )
  if (groupFilterId !== snapshot.groupFilterId || sourceFilterId !== snapshot.sourceFilterId) {
    patch({ groupFilterId, sourceFilterId })
  }
}

function articleVisibleInCurrentView(articleId: string): boolean {
  const { view, articles, filteredArticles, timelineDate } = snapshot
  if (view === 'timeline') {
    const hit = articles.some(a => a.id === articleId)
    if (!hit) return false
    if (!timelineDate) return true
    const d = new Date(articles.find(a => a.id === articleId)!.pub_date)
    if (!Number.isFinite(d.getTime())) return false
    const ymd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    return ymd === timelineDate
  }
  return filteredArticles.some(a => a.id === articleId)
}

function pruneSelection() {
  if (snapshot.selectedId && !articleVisibleInCurrentView(snapshot.selectedId)) {
    patch({ selectedId: null })
  }
}

async function loadMeta() {
  const [subsResp, settingsResp] = await Promise.all([
    news.listSubscriptions(),
    news.getSettings().catch(() => null),
  ])
  patch({
    subscriptions: subsResp.subscriptions,
    groups: subsResp.groups,
  })
  if (settingsResp?.settings?.refresh_interval_min != null) {
    syncNewsFeedRefreshPolicy(settingsResp.settings.refresh_interval_min)
    refreshPolicyHydrated = true
  }
}

function groupedHasContent(grouped: NewsGroupedFeed | null): grouped is NewsGroupedFeed {
  if (!grouped) return false
  return grouped.by_source.length > 0
    || grouped.groups.length > 0
    || grouped.ungrouped.length > 0
}

async function loadGrouped() {
  try {
    const grouped = await news.getGroupedFeed()
    patch({ grouped })
    normalizeListFilters()
    return
  } catch {
    if (groupedHasContent(snapshot.grouped)) return
    const fallback = buildGroupedFeedFallback(
      snapshot.articles,
      snapshot.subscriptions,
      snapshot.groups,
    )
    if (groupedHasContent(fallback)) {
      patch({ grouped: fallback })
      normalizeListFilters()
    }
  }
}

async function loadFilteredPage(append: boolean) {
  const { view, groupFilterId, sourceFilterId } = snapshot
  const query: {
    limit: number
    cursor: string | null
    group_id?: string | null
    subscription_id?: string | null
  } = {
    limit: NEWS_PAGE_SIZE,
    cursor: append ? snapshot.filteredCursor : null,
  }
  if (view === 'group') {
    if (!groupFilterId) return
    query.group_id = groupFilterId
  } else if (view === 'source') {
    if (!sourceFilterId) return
    query.subscription_id = sourceFilterId
  } else {
    return
  }

  const resp = await news.getFeed(query)
  const merged = append ? [...snapshot.filteredArticles, ...resp.articles] : resp.articles
  patch({
    filteredArticles: merged,
    filteredCursor: resp.next_cursor,
    filteredHasMore: resp.has_more,
    filteredTotal: resp.total,
    refreshedAt: resp.refreshed_at ?? snapshot.refreshedAt,
  })
  markNewsFeedSynced(resp.refreshed_at ?? snapshot.refreshedAt)
  pruneSelection()
}

async function loadFilteredView() {
  const { view, groupFilterId, sourceFilterId } = snapshot
  if (view === 'group' && !groupFilterId) return
  if (view === 'source' && !sourceFilterId) return
  patch({
    listSyncing: true,
    error: '',
    filteredCursor: null,
    filteredArticles: [],
    filteredHasMore: false,
    filteredTotal: 0,
  })
  try {
    await loadFilteredPage(false)
  } catch (e) {
    patch({ error: e instanceof Error ? e.message : '加载筛选列表失败' })
  } finally {
    patch({ listSyncing: false })
  }
}

async function syncFeedLists() {
  await loadTimelinePage(false)
  void loadGrouped()
}

async function syncCurrentViewLists() {
  await syncFeedLists()
  if (snapshot.view === 'group' || snapshot.view === 'source') {
    await loadFilteredView()
  }
}

async function loadTimelinePage(append: boolean) {
  const resp = await news.getFeed({
    limit: NEWS_PAGE_SIZE,
    cursor: append ? snapshot.cursor : null,
    date: snapshot.timelineDate,
  })
  const merged = append ? [...snapshot.articles, ...resp.articles] : resp.articles
  const deduped = dedupeArticlesByTitle(merged)
  const { articles, capped } = applyArticlesMemoryCap(deduped)
  const listCapReached = capped || (
    articles.length >= NEWS_ARTICLES_MEMORY_CAP && resp.has_more
  )
  patch({
    cursor: resp.next_cursor,
    hasMore: resp.has_more && !listCapReached,
    listCapReached,
    total: resp.total,
    refreshedAt: resp.refreshed_at,
    articles,
  })
  markNewsFeedSynced(resp.refreshed_at)
  pruneSelection()
  return resp
}

async function softSync(opts?: { silent?: boolean }) {
  if (softSyncPromise) return softSyncPromise
  const silent = opts?.silent === true
  if (silent && snapshot.articles.length > 0) {
    patch({ refreshing: true })
  }
  softSyncPromise = (async () => {
    try {
      await loadMeta()
      await syncCurrentViewLists()
      normalizeListFilters()
      patch({ hydrated: true, error: '' })
    } catch (e) {
      patch({
        error: e instanceof Error ? e.message : '同步资讯失败',
      })
    } finally {
      patch({ refreshing: false })
      softSyncPromise = null
    }
  })()
  return softSyncPromise
}

async function bootstrap() {
  if (bootstrapPromise) return bootstrapPromise
  const showBlockingLoader = !snapshot.hydrated
  if (showBlockingLoader) patch({ initializing: true, error: '' })

  bootstrapPromise = (async () => {
    try {
      await loadMeta()
      await syncFeedLists()
      normalizeListFilters()
      patch({ hydrated: true, error: '' })
    } catch (e) {
      patch({
        error: e instanceof Error ? e.message : '加载资讯失败',
      })
    } finally {
      patch({ initializing: false })
      bootstrapPromise = null
    }
  })()
  return bootstrapPromise
}

export function acquireNewsFeedPagePolling(): void {
  void ensureNewsFeedRefreshPolicyHydrated()
  pagePollRefCount += 1
  if (pagePollRefCount === 1) {
    if (!bootstrapped) {
      bootstrapped = true
      void bootstrap()
    } else {
      scheduleNewsFeedSync()
    }
    ensureNewsPagePoller().acquire()
  }
}

export function releaseNewsFeedPagePolling(): void {
  pagePollRefCount = Math.max(0, pagePollRefCount - 1)
  if (pagePollRefCount === 0) {
    ensureNewsPagePoller().release()
  }
}

/** 一次性引导（不开启轮询）；页面可见时请用 acquireNewsFeedPagePolling */
export function ensureNewsFeedBootstrapped() {
  if (!bootstrapped) {
    bootstrapped = true
    void bootstrap()
  }
}

export function setNewsFeedView(next: NewsListView) {
  patch({ view: next })
  normalizeListFilters()
  pruneSelection()
  if (next === 'group' || next === 'source') {
    void loadFilteredView()
  }
}

export function setNewsFeedSelectedId(id: string | null) {
  patch({ selectedId: id })
}

export async function setNewsFeedTimelineDate(date: string | null) {
  const next = date?.trim() || null
  if (next === snapshot.timelineDate) return
  patch({ timelineDate: next, cursor: null, listSyncing: true, error: '' })
  try {
    await loadTimelinePage(false)
  } catch (e) {
    patch({ error: e instanceof Error ? e.message : '按日期筛选失败' })
  } finally {
    patch({ listSyncing: false })
  }
}

export function setNewsFeedGroupFilter(groupId: string) {
  patch({ groupFilterId: groupId })
  pruneSelection()
  if (snapshot.view === 'group') void loadFilteredView()
}

export function setNewsFeedSourceFilter(subscriptionId: string) {
  patch({ sourceFilterId: subscriptionId })
  pruneSelection()
  if (snapshot.view === 'source') void loadFilteredView()
}

export async function loadMoreNewsFeed() {
  if (snapshot.loadingMore || snapshot.listSyncing) return

  if (snapshot.view === 'timeline') {
    if (!snapshot.hasMore) return
    if (snapshot.listCapReached || snapshot.articles.length >= NEWS_ARTICLES_MEMORY_CAP) {
      patch({ hasMore: false, listCapReached: true })
      return
    }
    patch({ loadingMore: true, error: '' })
    try {
      await loadTimelinePage(true)
    } catch (e) {
      patch({ error: e instanceof Error ? e.message : '加载更多失败' })
    } finally {
      patch({ loadingMore: false })
    }
    return
  }

  if (snapshot.view !== 'group' && snapshot.view !== 'source') return
  if (!snapshot.filteredHasMore) return

  patch({ loadingMore: true, error: '' })
  try {
    await loadFilteredPage(true)
  } catch (e) {
    patch({ error: e instanceof Error ? e.message : '加载更多失败' })
  } finally {
    patch({ loadingMore: false })
  }
}

export async function refreshNewsFeed(): Promise<NewsFeedRefreshResult> {
  if (snapshot.refreshing) return { ok: true }
  patch({ refreshing: true, error: '' })
  try {
    patch({ cursor: null })
    await loadMeta()
    await syncCurrentViewLists()
    normalizeListFilters()
    patch({ hydrated: true, listPulseEpoch: snapshot.listPulseEpoch + 1 })
    markNewsFeedSynced(snapshot.refreshedAt)
    pruneSelection()
    return { ok: true }
  } catch (e) {
    const message = e instanceof Error ? e.message : '刷新列表失败，请稍后再试'
    patch({ error: message })
    return { ok: false, message }
  } finally {
    patch({ refreshing: false })
  }
}

/** 设置页变更订阅后，由外部触发重新同步 */
export async function reloadNewsFeed() {
  patch({ cursor: null, filteredCursor: null })
  lastSyncedAtMs = 0
  await softSync()
}
