import { randomUUID } from 'node:crypto'
import type {
  FeedArticle,
  FeedGroup,
  FeedPageQuery,
  FeedPageResult,
  FeedSubscription,
  NewsSettings,
  ValidateFeedResult,
} from './types.js'
import { FEED_PAGE_SIZE } from './types.js'
import { MAX_ARTICLES_PER_FETCH } from './retention.js'
import { resolveFeedUrl } from './url.js'
import { fetchAndParseFeed } from './parser.js'
import { getNewsFeedStore } from './store.js'
import {
  refreshAllSubscriptions,
  refreshSubscription,
  shouldAutoRefresh,
} from './aggregator.js'
import type { SubscriptionImportResult } from './subscription-transfer.js'
import {
  SUBSCRIPTION_EXPORT_SCHEMA_VERSION,
  buildSubscriptionExportFile,
  parseSubscriptionExportJson,
  parseSubscriptionExportPayload,
} from './subscription-transfer.js'

export * from './types.js'
export { resolveFeedUrl } from './url.js'
export { getNewsFeedStore, NewsFeedStore } from './store.js'
export { startNewsFeedScheduler, stopNewsFeedScheduler } from './scheduler.js'

export interface FeedUrlInput {
  url: string
  title?: string
  group_id?: string | null
}

export function getNewsSettings(): NewsSettings {
  return getNewsFeedStore().getSettings()
}

export function saveNewsSettings(settings: NewsSettings): NewsSettings {
  return getNewsFeedStore().saveSettings(settings)
}

export function listGroups(): FeedGroup[] {
  return getNewsFeedStore().listGroups()
}

export function createGroup(title: string): FeedGroup {
  return getNewsFeedStore().upsertGroup({ title })
}

export function updateGroup(id: string, patch: { title?: string; sort_order?: number }): FeedGroup {
  const store = getNewsFeedStore()
  const cur = store.listGroups().find(g => g.id === id)
  if (!cur) throw new Error('分组不存在')
  return store.upsertGroup({
    id,
    title: patch.title ?? cur.title,
    sort_order: patch.sort_order ?? cur.sort_order,
  })
}

export function deleteGroup(id: string): boolean {
  return getNewsFeedStore().deleteGroup(id)
}

export function reorderGroups(groupIds: string[]): FeedGroup[] {
  return getNewsFeedStore().reorderGroups(groupIds)
}

export function listSubscriptions(): FeedSubscription[] {
  return getNewsFeedStore().listSubscriptions()
}

export function saveSubscriptions(subs: FeedSubscription[]): FeedSubscription[] {
  return getNewsFeedStore().saveSubscriptions(subs)
}

export function moveSubscriptionToGroup(subId: string, groupId: string | null): FeedSubscription {
  return getNewsFeedStore().moveSubscriptionToGroup(subId, groupId)
}

export function deleteSubscription(id: string): boolean {
  return getNewsFeedStore().deleteSubscription(id)
}

export async function validateFeedUrl(input: FeedUrlInput): Promise<ValidateFeedResult> {
  try {
    const { resolved_url, kind } = resolveFeedUrl(input.url)
    const stub: FeedSubscription = {
      id: 'validate',
      title: input.title || '验证中',
      url: input.url.trim(),
      resolved_url,
      kind,
      enabled: true,
      created_at: new Date().toISOString(),
    }
    const result = await fetchAndParseFeed(stub)
    return {
      ok: true,
      title: result.title || input.title || input.url,
      item_count: result.items.length,
      kind: result.kind,
      resolved_url,
    }
  } catch (e) {
    return {
      ok: false,
      title: input.title || '',
      item_count: 0,
      kind: 'rss',
      resolved_url: '',
      error: e instanceof Error ? e.message : String(e),
    }
  }
}

export async function addSubscription(input: FeedUrlInput & { enabled?: boolean }): Promise<FeedSubscription> {
  const store = getNewsFeedStore()
  const duplicate = store.findSubscriptionByUrl(input.url)
  if (duplicate) {
    throw new Error(`该订阅地址已添加（${duplicate.title}）`)
  }
  const validated = await validateFeedUrl(input)
  if (!validated.ok) throw new Error(validated.error || '订阅源验证失败')
  const { resolved_url, kind } = resolveFeedUrl(input.url)
  const sub = store.upsertSubscription({
    id: randomUUID(),
    title: input.title?.trim() || validated.title,
    url: input.url.trim(),
    resolved_url,
    kind: validated.kind,
    group_id: input.group_id ?? null,
    enabled: input.enabled !== false,
  })
  void refreshSubscription(sub).catch(() => {})
  return sub
}

export async function importSubscriptions(
  items: Array<{ url: string; title?: string }>,
): Promise<SubscriptionImportResult> {
  const result: SubscriptionImportResult = { added: 0, skipped: 0, errors: [] }
  const store = getNewsFeedStore()

  for (const item of items) {
    const url = item.url?.trim()
    if (!url) {
      result.errors.push({ url: item.url ?? '', error: '订阅地址为空' })
      continue
    }
    if (store.findSubscriptionByUrl(url)) {
      result.skipped += 1
      continue
    }
    try {
      await addSubscription({
        url,
        title: item.title?.trim() || undefined,
        group_id: null,
      })
      result.added += 1
    } catch (e) {
      result.errors.push({
        url,
        error: e instanceof Error ? e.message : String(e),
      })
    }
  }

  return result
}

export function getFeedArticles(query: FeedPageQuery = {}): FeedPageResult & {
  refreshed_at: string | null
  stale: boolean
} {
  const store = getNewsFeedStore()
  const page = store.listArticlesPage({
    limit: query.limit ?? FEED_PAGE_SIZE,
    cursor: query.cursor ?? null,
    subscription_id: query.subscription_id ?? null,
    group_id: query.group_id ?? null,
    date: query.date ?? null,
  })
  return {
    ...page,
    refreshed_at: store.getRefreshedAt(),
    stale: shouldAutoRefresh(),
  }
}

export function getArticlesGrouped(): {
  groups: Array<{ id: string; title: string; articles: FeedArticle[] }>
  ungrouped: FeedArticle[]
  by_source: Array<{ subscription_id: string; title: string; articles: FeedArticle[] }>
} {
  const store = getNewsFeedStore()
  const subs = store.listSubscriptions()
  const groups = store.listGroups()

  const bySub = new Map<string, FeedArticle[]>()
  for (const sub of subs) {
    bySub.set(sub.id, store.listArticlesBySubscription(sub.id, MAX_ARTICLES_PER_FETCH))
  }

  const by_source = subs.map(sub => ({
    subscription_id: sub.id,
    title: sub.title,
    articles: bySub.get(sub.id) ?? [],
  })).filter(s => s.articles.length > 0)

  const all = subs.flatMap(sub => bySub.get(sub.id) ?? [])

  const groupedSections = groups.map(g => {
    const subIds = new Set(subs.filter(s => s.group_id === g.id).map(s => s.id))
    const articles = all.filter(a => subIds.has(a.subscription_id))
    return { id: g.id, title: g.title, articles }
  }).filter(g => g.articles.length > 0)

  const ungroupedSubIds = new Set(subs.filter(s => !s.group_id).map(s => s.id))
  const ungrouped = all.filter(a => ungroupedSubIds.has(a.subscription_id))

  return { groups: groupedSections, ungrouped, by_source }
}

export function getArticle(id: string): FeedArticle | undefined {
  return getNewsFeedStore().getArticle(id)
}

export async function refreshFeeds(force = false): Promise<{
  refreshed: number
  errors: Array<{ id: string; title: string; error: string }>
  page: FeedPageResult
}> {
  if (!force && !shouldAutoRefresh()) {
    const store = getNewsFeedStore()
    return {
      refreshed: 0,
      errors: [],
      page: store.listArticlesPage({ limit: FEED_PAGE_SIZE }),
    }
  }
  const result = await refreshAllSubscriptions()
  return {
    ...result,
    page: getNewsFeedStore().listArticlesPage({ limit: FEED_PAGE_SIZE }),
  }
}

export { refreshAllSubscriptions, shouldAutoRefresh }
export {
  extractTwitterStatusId,
  normalizeFeedItemDedupeKey,
  resolveFeedItemGuid,
  resolveTwitterFeedTitle,
} from './twitter-guid.js'
export {
  SUBSCRIPTION_EXPORT_SCHEMA_VERSION,
  buildSubscriptionExportFile,
  parseSubscriptionExportJson,
  parseSubscriptionExportPayload,
} from './subscription-transfer.js'
export type {
  SubscriptionExportFile,
  SubscriptionExportItem,
  SubscriptionImportResult,
} from './subscription-transfer.js'
export { normalizeNewsSettings, normalizeTranslationSettings, selectRetainedArticles } from './retention.js'
export {
  normalizeArticleTitle,
  articleTitleDedupeKey,
  dedupeArticlesByTitle,
  dedupeArticleIdsByTitle,
} from './dedupe.js'
export {
  compressNewsTextForAgent,
  summarizeArticleForAgent,
  formatArticleDetailForAgent,
} from './agent-format.js'
