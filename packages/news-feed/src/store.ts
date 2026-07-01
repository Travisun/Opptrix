import { randomUUID } from 'node:crypto'
import { getUserDataStore } from '@opptrix/user-store'
import type {
  FeedArticle,
  FeedGroup,
  FeedPageQuery,
  FeedPageResult,
  FeedSubscription,
  NewsFeedIndex,
  NewsSettings,
  SubscriptionFetchMeta,
} from './types.js'
import {
  DEFAULT_NEWS_SETTINGS,
  FEED_PAGE_SIZE,
} from './types.js'
import { normalizeNewsSettings, selectRetainedArticles, sortArticlesByPubDate } from './retention.js'

const PREF_NS = 'preference'
const SUBS_KEY = 'news_subscriptions'
const GROUPS_KEY = 'news_groups'
const SETTINGS_KEY = 'news_settings'
const INDEX_NS = 'news_index'
const INDEX_ID = 'main'
const ARTICLE_NS = 'news_article'
const LEGACY_CACHE_NS = 'news_cache'
const LEGACY_CACHE_ID = 'merged'

function emptyIndex(): NewsFeedIndex {
  return { refreshed_at: null, subscription_meta: {}, article_order: [] }
}

function encodeCursor(pubDate: string, id: string): string {
  return `${pubDate}::${id}`
}

function decodeCursor(cursor: string): { pubDate: string; id: string } | null {
  const idx = cursor.indexOf('::')
  if (idx <= 0) return null
  return { pubDate: cursor.slice(0, idx), id: cursor.slice(idx + 2) }
}

function articleLocalYmd(pubDate: string): string | null {
  const d = new Date(pubDate)
  if (!Number.isFinite(d.getTime())) return null
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export class NewsFeedStore {
  private migrated = false

  private get store() {
    return getUserDataStore()
  }

  private ensureMigrated() {
    if (this.migrated) return
    this.migrated = true
    const legacy = this.store.getDocument<{ articles?: FeedArticle[]; refreshed_at?: string | null; subscription_meta?: Record<string, SubscriptionFetchMeta> }>(
      LEGACY_CACHE_NS,
      LEGACY_CACHE_ID,
    )
    if (!legacy?.articles?.length) return

    for (const article of legacy.articles) {
      this.store.setDocument(ARTICLE_NS, article.id, article)
    }
    const index = this.getIndex()
    index.refreshed_at = legacy.refreshed_at ?? index.refreshed_at
    index.subscription_meta = { ...index.subscription_meta, ...legacy.subscription_meta }
    this.rebuildArticleIndex()
    this.store.deleteDocument(LEGACY_CACHE_NS, LEGACY_CACHE_ID)
  }

  getSettings(): NewsSettings {
    const raw = this.store.getDocument<Partial<NewsSettings>>(PREF_NS, SETTINGS_KEY)
    return normalizeNewsSettings(raw)
  }

  saveSettings(settings: NewsSettings): NewsSettings {
    const next = normalizeNewsSettings(settings)
    this.store.setDocument(PREF_NS, SETTINGS_KEY, next)
    this.applyRetentionPolicy()
    return next
  }

  listGroups(): FeedGroup[] {
    const groups = this.store.getDocument<FeedGroup[]>(PREF_NS, GROUPS_KEY) ?? []
    return groups.slice().sort((a, b) => a.sort_order - b.sort_order || a.title.localeCompare(b.title, 'zh-CN'))
  }

  saveGroups(groups: FeedGroup[]): FeedGroup[] {
    const sorted = groups.slice().sort((a, b) => a.sort_order - b.sort_order)
    this.store.setDocument(PREF_NS, GROUPS_KEY, sorted)
    return sorted
  }

  upsertGroup(input: { id?: string; title: string; sort_order?: number }): FeedGroup {
    const groups = this.listGroups()
    const now = new Date().toISOString()
    const title = input.title.trim()
    if (!title) throw new Error('分组名称不能为空')

    if (input.id) {
      const idx = groups.findIndex(g => g.id === input.id)
      if (idx < 0) throw new Error('分组不存在')
      groups[idx] = {
        ...groups[idx],
        title,
        sort_order: input.sort_order ?? groups[idx].sort_order,
      }
      this.saveGroups(groups)
      return groups[idx]
    }

    const maxOrder = groups.reduce((m, g) => Math.max(m, g.sort_order), -1)
    const entry: FeedGroup = {
      id: randomUUID(),
      title,
      sort_order: input.sort_order ?? maxOrder + 1,
      created_at: now,
    }
    groups.push(entry)
    this.saveGroups(groups)
    return entry
  }

  deleteGroup(id: string): boolean {
    const groups = this.listGroups()
    const next = groups.filter(g => g.id !== id)
    if (next.length === groups.length) return false
    this.saveGroups(next)
    const subs = this.listSubscriptions().map(s =>
      s.group_id === id ? { ...s, group_id: null } : s,
    )
    this.saveSubscriptions(subs)
    return true
  }

  reorderGroups(groupIds: string[]): FeedGroup[] {
    const groups = this.listGroups()
    const map = new Map(groups.map(g => [g.id, g]))
    const reordered: FeedGroup[] = []
    groupIds.forEach((id, i) => {
      const g = map.get(id)
      if (g) reordered.push({ ...g, sort_order: i })
    })
    for (const g of groups) {
      if (!groupIds.includes(g.id)) reordered.push(g)
    }
    return this.saveGroups(reordered)
  }

  listSubscriptions(): FeedSubscription[] {
    return this.store.getDocument<FeedSubscription[]>(PREF_NS, SUBS_KEY) ?? []
  }

  saveSubscriptions(subs: FeedSubscription[]): FeedSubscription[] {
    this.store.setDocument(PREF_NS, SUBS_KEY, subs)
    return subs
  }

  moveSubscriptionToGroup(subId: string, groupId: string | null): FeedSubscription {
    const subs = this.listSubscriptions()
    const idx = subs.findIndex(s => s.id === subId)
    if (idx < 0) throw new Error('订阅不存在')
    if (groupId && !this.listGroups().some(g => g.id === groupId)) {
      throw new Error('分组不存在')
    }
    subs[idx] = { ...subs[idx], group_id: groupId }
    this.saveSubscriptions(subs)
    return subs[idx]
  }

  upsertSubscription(sub: Omit<FeedSubscription, 'id' | 'created_at'> & { id?: string }): FeedSubscription {
    const list = this.listSubscriptions()
    const now = new Date().toISOString()
    const entry: FeedSubscription = {
      id: sub.id ?? randomUUID(),
      title: sub.title,
      url: sub.url,
      resolved_url: sub.resolved_url,
      kind: sub.kind,
      enabled: sub.enabled,
      group_id: sub.group_id ?? null,
      created_at: list.find(s => s.id === sub.id)?.created_at ?? now,
      last_fetched_at: sub.last_fetched_at,
      last_error: sub.last_error,
    }
    const idx = list.findIndex(s => s.id === entry.id)
    if (idx >= 0) list[idx] = entry
    else list.push(entry)
    this.saveSubscriptions(list)
    return entry
  }

  deleteSubscription(id: string): boolean {
    const list = this.listSubscriptions().filter(s => s.id !== id)
    if (list.length === this.listSubscriptions().length) return false
    this.saveSubscriptions(list)
    this.deleteArticlesBySubscription(id)
    const index = this.getIndex()
    delete index.subscription_meta[id]
    this.saveIndex(index)
    return true
  }

  private getIndex(): NewsFeedIndex {
    this.ensureMigrated()
    return this.store.getDocument<NewsFeedIndex>(INDEX_NS, INDEX_ID) ?? emptyIndex()
  }

  private saveIndex(index: NewsFeedIndex): void {
    this.store.setDocument(INDEX_NS, INDEX_ID, index)
  }

  getSubscriptionMeta(subId: string): SubscriptionFetchMeta {
    return this.getIndex().subscription_meta[subId] ?? {}
  }

  updateSubscriptionMeta(subId: string, meta: SubscriptionFetchMeta): void {
    const index = this.getIndex()
    index.subscription_meta[subId] = { ...index.subscription_meta[subId], ...meta }
    this.saveIndex(index)
  }

  setRefreshedAt(iso: string): void {
    const index = this.getIndex()
    index.refreshed_at = iso
    this.saveIndex(index)
  }

  getRefreshedAt(): string | null {
    return this.getIndex().refreshed_at
  }

  private getArticleDoc(id: string): FeedArticle | null {
    return this.store.getDocument<FeedArticle>(ARTICLE_NS, id)
  }

  upsertArticlesForSubscription(subscriptionId: string, articles: FeedArticle[]): void {
    this.ensureMigrated()
    for (const article of articles) {
      this.store.setDocument(ARTICLE_NS, article.id, article)
    }
    this.applyRetentionPolicy()
  }

  private listAllArticles(): FeedArticle[] {
    return this.store.listDocuments<FeedArticle>(ARTICLE_NS)
  }

  private applyRetentionPolicy(): void {
    const settings = this.getSettings()
    const all = this.listAllArticles()
    const kept = selectRetainedArticles(all, settings)
    const keepIds = new Set(kept.map(a => a.id))

    for (const article of all) {
      if (!keepIds.has(article.id)) {
        this.store.deleteDocument(ARTICLE_NS, article.id)
      }
    }

    const index = this.getIndex()
    index.article_order = kept.map(a => a.id)
    this.saveIndex(index)
  }

  private deleteArticlesBySubscription(subscriptionId: string): void {
    const articles = this.store.listDocuments<FeedArticle>(ARTICLE_NS)
      .filter(a => a.subscription_id === subscriptionId)
    for (const a of articles) {
      this.store.deleteDocument(ARTICLE_NS, a.id)
    }
    this.rebuildArticleIndex()
  }

  rebuildArticleIndex(): void {
    const articles = sortArticlesByPubDate(this.listAllArticles())
    const index = this.getIndex()
    index.article_order = articles.map(a => a.id)
    this.saveIndex(index)
    this.applyRetentionPolicy()
  }

  private resolveFilterSubscriptionIds(query: FeedPageQuery): Set<string> | null {
    if (query.subscription_id) return new Set([query.subscription_id])
    if (!query.group_id) return null
    const subs = this.listSubscriptions().filter(s => {
      if (query.group_id === '__ungrouped__') return !s.group_id
      return s.group_id === query.group_id
    })
    return new Set(subs.map(s => s.id))
  }

  listArticlesPage(query: FeedPageQuery = {}): FeedPageResult {
    this.ensureMigrated()
    const limit = Math.min(100, Math.max(1, query.limit ?? FEED_PAGE_SIZE))
    const index = this.getIndex()
    const filterSubs = this.resolveFilterSubscriptionIds(query)

    let ids = index.article_order
    if (filterSubs) {
      ids = ids.filter(id => {
        const doc = this.getArticleDoc(id)
        return doc && filterSubs.has(doc.subscription_id)
      })
    }
    if (query.date) {
      const day = query.date.trim()
      ids = ids.filter(id => {
        const doc = this.getArticleDoc(id)
        return doc && articleLocalYmd(doc.pub_date) === day
      })
    }

    let start = 0
    if (query.cursor) {
      const parsed = decodeCursor(query.cursor)
      if (parsed) {
        const pos = ids.findIndex(id => {
          const doc = this.getArticleDoc(id)
          if (!doc) return false
          return doc.pub_date === parsed.pubDate && doc.id === parsed.id
        })
        start = pos >= 0 ? pos + 1 : 0
      }
    }

    const sliceIds = ids.slice(start, start + limit)
    const articles = sliceIds
      .map(id => this.getArticleDoc(id))
      .filter((a): a is FeedArticle => !!a)

    const last = articles[articles.length - 1]
    const hasMore = start + limit < ids.length
    const next_cursor = hasMore && last ? encodeCursor(last.pub_date, last.id) : null

    return {
      articles,
      next_cursor,
      has_more: hasMore,
      total: ids.length,
    }
  }

  listArticlesBySubscription(subscriptionId: string, limit = 50): FeedArticle[] {
    return this.listArticlesPage({ subscription_id: subscriptionId, limit }).articles
  }

  listArticles(limit = 100): FeedArticle[] {
    return this.listArticlesPage({ limit }).articles
  }

  getArticle(id: string): FeedArticle | undefined {
    this.ensureMigrated()
    return this.getArticleDoc(id) ?? undefined
  }
}

let storeInst: NewsFeedStore | null = null

export function getNewsFeedStore(): NewsFeedStore {
  if (!storeInst) storeInst = new NewsFeedStore()
  return storeInst
}
