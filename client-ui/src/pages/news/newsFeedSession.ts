import { news } from '../../api/client'
import type {
  FeedArticle,
  FeedGroup,
  FeedSubscription,
  NewsGroupedFeed,
} from '../../types/schemas'
import { dedupeArticlesByTitle } from './newsUtils'

export type NewsListView = 'timeline' | 'group' | 'source'

export const NEWS_PAGE_SIZE = 20
export const NEWS_PRELOAD_THRESHOLD = 3

export type NewsFeedSnapshot = {
  articles: FeedArticle[]
  grouped: NewsGroupedFeed | null
  subscriptions: FeedSubscription[]
  groups: FeedGroup[]
  refreshedAt: string | null
  hasMore: boolean
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
    subscriptions: [],
    groups: [],
    refreshedAt: null,
    hasMore: false,
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

function findSelected(
  selectedId: string | null,
  articles: FeedArticle[],
  grouped: NewsGroupedFeed | null,
): FeedArticle | null {
  if (!selectedId) return null
  const fromTimeline = articles.find(a => a.id === selectedId)
  if (fromTimeline) return fromTimeline
  if (!grouped) return null
  return grouped.groups.flatMap(g => g.articles).find(a => a.id === selectedId)
    ?? grouped.ungrouped.find(a => a.id === selectedId)
    ?? grouped.by_source.flatMap(s => s.articles).find(a => a.id === selectedId)
    ?? null
}

export function getSelectedArticle(): FeedArticle | null {
  return findSelected(snapshot.selectedId, snapshot.articles, snapshot.grouped)
}

function defaultGroupFilterId(
  groups: FeedGroup[],
  grouped: NewsGroupedFeed | null,
): string | null {
  if (groups.length > 0) return groups[0].id
  if ((grouped?.ungrouped.length ?? 0) > 0) return '__ungrouped__'
  return null
}

function defaultSourceFilterId(
  subscriptions: FeedSubscription[],
  grouped: NewsGroupedFeed | null,
): string | null {
  if (grouped?.by_source.length) return grouped.by_source[0].subscription_id
  const sub = subscriptions.find(s => s.enabled) ?? subscriptions[0]
  return sub?.id ?? null
}

function resolveGroupFilterId(
  groups: FeedGroup[],
  grouped: NewsGroupedFeed | null,
  current: string | null,
): string | null {
  const fallback = defaultGroupFilterId(groups, grouped)
  if (!current) return fallback
  if (current === '__ungrouped__') {
    return (grouped?.ungrouped.length ?? 0) > 0 ? current : fallback
  }
  return groups.some(g => g.id === current) ? current : fallback
}

function resolveSourceFilterId(
  subscriptions: FeedSubscription[],
  grouped: NewsGroupedFeed | null,
  current: string | null,
): string | null {
  const fallback = defaultSourceFilterId(subscriptions, grouped)
  if (!current) return fallback
  if (grouped?.by_source.some(s => s.subscription_id === current)) return current
  if (subscriptions.some(s => s.id === current)) return current
  return fallback
}

function normalizeListFilters() {
  const groupFilterId = resolveGroupFilterId(
    snapshot.groups,
    snapshot.grouped,
    snapshot.groupFilterId,
  )
  const sourceFilterId = resolveSourceFilterId(
    snapshot.subscriptions,
    snapshot.grouped,
    snapshot.sourceFilterId,
  )
  if (groupFilterId !== snapshot.groupFilterId || sourceFilterId !== snapshot.sourceFilterId) {
    patch({ groupFilterId, sourceFilterId })
  }
}

function articleVisibleInCurrentView(articleId: string): boolean {
  const { view, articles, grouped, timelineDate, groupFilterId, sourceFilterId } = snapshot
  if (view === 'timeline') {
    const hit = articles.some(a => a.id === articleId)
    if (!hit) return false
    if (!timelineDate) return true
    const d = new Date(articles.find(a => a.id === articleId)!.pub_date)
    if (!Number.isFinite(d.getTime())) return false
    const ymd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    return ymd === timelineDate
  }
  if (!grouped) return false
  if (view === 'group') {
    if (groupFilterId === '__ungrouped__') {
      return grouped.ungrouped.some(a => a.id === articleId)
    }
    const sec = grouped.groups.find(g => g.id === groupFilterId)
    return sec?.articles.some(a => a.id === articleId) ?? false
  }
  const sec = grouped.by_source.find(s => s.subscription_id === sourceFilterId)
  return sec?.articles.some(a => a.id === articleId) ?? false
}

function pruneSelection() {
  if (snapshot.selectedId && !articleVisibleInCurrentView(snapshot.selectedId)) {
    patch({ selectedId: null })
  }
}

async function loadMeta() {
  const resp = await news.listSubscriptions()
  patch({
    subscriptions: resp.subscriptions,
    groups: resp.groups,
  })
}

async function loadGrouped() {
  const grouped = await news.getGroupedFeed()
  patch({ grouped })
}

async function loadTimelinePage(append: boolean) {
  const resp = await news.getFeed({
    limit: NEWS_PAGE_SIZE,
    cursor: append ? snapshot.cursor : null,
    date: snapshot.timelineDate,
  })
  const merged = append ? [...snapshot.articles, ...resp.articles] : resp.articles
  const articles = dedupeArticlesByTitle(merged)
  patch({
    cursor: resp.next_cursor,
    hasMore: resp.has_more,
    total: resp.total,
    refreshedAt: resp.refreshed_at,
    articles,
  })
  pruneSelection()
  return resp
}

async function softSync() {
  if (softSyncPromise) return softSyncPromise
  softSyncPromise = (async () => {
    try {
      await loadMeta()
      await Promise.all([
        loadTimelinePage(false),
        loadGrouped(),
      ])
      normalizeListFilters()
      patch({ hydrated: true, error: '' })
    } catch (e) {
      patch({
        error: e instanceof Error ? e.message : '同步资讯失败',
      })
    } finally {
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
      await Promise.all([
        loadTimelinePage(false),
        loadGrouped(),
      ])
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

export function ensureNewsFeedBootstrapped() {
  if (!bootstrapped) {
    bootstrapped = true
    void bootstrap()
    return
  }
  if (!snapshot.hydrated) {
    void bootstrap()
    return
  }
  void softSync()
}

export function setNewsFeedView(next: NewsListView) {
  patch({ view: next })
  normalizeListFilters()
  pruneSelection()
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
}

export function setNewsFeedSourceFilter(subscriptionId: string) {
  patch({ sourceFilterId: subscriptionId })
  pruneSelection()
}

export async function loadMoreNewsFeed() {
  if (snapshot.view !== 'timeline' || snapshot.loadingMore || !snapshot.hasMore || snapshot.listSyncing) return
  patch({ loadingMore: true, error: '' })
  try {
    await loadTimelinePage(true)
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
    await Promise.all([
      loadTimelinePage(false),
      loadGrouped(),
    ])
    normalizeListFilters()
    patch({ hydrated: true, listPulseEpoch: snapshot.listPulseEpoch + 1 })
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
  patch({ cursor: null })
  await softSync()
}
