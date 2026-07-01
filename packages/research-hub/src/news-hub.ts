import {
  compressNewsTextForAgent,
  formatArticleDetailForAgent,
  summarizeArticleForAgent,
  getArticle,
  getFeedArticles,
  getNewsFeedStore,
  getNewsSettings,
  listGroups,
  listSubscriptions,
  shouldAutoRefresh,
} from '@opptrix/news-feed'
import { ok, fail, type ResearchResult } from '@opptrix/shared'

type NewsListView = 'timeline' | 'group' | 'source'

function resolveView(
  viewRaw: unknown,
  groupId: string | null,
  subscriptionId: string | null,
): NewsListView | { error: string } {
  const view = typeof viewRaw === 'string' ? viewRaw.trim().toLowerCase() : ''
  if (view === 'timeline' || view === 'group' || view === 'source') {
    if (view === 'group' && !groupId) {
      return { error: 'view=group 时须传 group_id（未分组用 __ungrouped__）' }
    }
    if (view === 'source' && !subscriptionId) {
      return { error: 'view=source 时须传 subscription_id' }
    }
    return view
  }
  if (subscriptionId) return 'source'
  if (groupId) return 'group'
  return 'timeline'
}

export function newsCenterStatus(t0: number): ResearchResult {
  const store = getNewsFeedStore()
  const subs = listSubscriptions()
  const groups = listGroups()
  const page = store.listArticlesPage({ limit: 1 })
  return ok({
    refreshed_at: store.getRefreshedAt(),
    stale: shouldAutoRefresh(),
    settings: getNewsSettings(),
    subscription_count: subs.length,
    enabled_subscription_count: subs.filter(s => s.enabled).length,
    group_count: groups.length,
    indexed_article_total: page.total,
  }, '资讯中心状态', t0)
}

export function newsGroupsList(t0: number): ResearchResult {
  const groups = listGroups()
  const subs = listSubscriptions()
  const items = groups.map(g => ({
    id: g.id,
    title: g.title,
    sort_order: g.sort_order,
    subscription_count: subs.filter(s => s.group_id === g.id).length,
  }))
  const ungroupedCount = subs.filter(s => !s.group_id).length
  return ok({
    groups: items,
    ungrouped_subscription_count: ungroupedCount,
    hint: '按分组浏览文章时 list_news_articles 传 view=group 与 group_id；未分组订阅用 group_id=__ungrouped__',
  }, `资讯分组 ${items.length} 个`, t0)
}

export function newsSourcesList(t0: number): ResearchResult {
  const subs = listSubscriptions()
  const groups = listGroups()
  const groupTitle = new Map(groups.map(g => [g.id, g.title]))
  const items = subs.map(s => ({
    id: s.id,
    title: s.title,
    url: s.url,
    kind: s.kind,
    enabled: s.enabled,
    group_id: s.group_id ?? null,
    group_title: s.group_id ? groupTitle.get(s.group_id) ?? null : null,
    last_fetched_at: s.last_fetched_at ?? null,
    last_error: s.last_error ?? null,
  }))
  return ok({
    sources: items,
    hint: '按来源浏览文章时 list_news_articles 传 view=source 与 subscription_id',
  }, `资讯来源 ${items.length} 个`, t0)
}

export function newsArticlesList(params: Record<string, unknown>, t0: number): ResearchResult {
  const groupId = typeof params.group_id === 'string' && params.group_id.trim()
    ? params.group_id.trim()
    : null
  const subscriptionId = typeof params.subscription_id === 'string' && params.subscription_id.trim()
    ? params.subscription_id.trim()
    : null
  const date = typeof params.date === 'string' && params.date.trim()
    ? params.date.trim()
    : null
  const cursor = typeof params.cursor === 'string' && params.cursor.trim()
    ? params.cursor.trim()
    : null
  const limitRaw = Number(params.limit ?? 20)
  const limit = Math.min(50, Math.max(1, Number.isFinite(limitRaw) ? limitRaw : 20))

  const resolved = resolveView(params.view, groupId, subscriptionId)
  if (typeof resolved === 'object' && 'error' in resolved) {
    return fail(resolved.error, t0)
  }
  const view = resolved

  if (view === 'timeline' && (groupId || subscriptionId)) {
    return fail('view=timeline 时不要传 group_id 或 subscription_id；按日期可用 date=YYYY-MM-DD', t0)
  }
  if (view === 'group' && !groupId) {
    return fail('view=group 须传 group_id（未分组订阅用 __ungrouped__）', t0)
  }
  if (view === 'source' && !subscriptionId) {
    return fail('view=source 须传 subscription_id', t0)
  }

  const page = getFeedArticles({
    limit,
    cursor,
    subscription_id: view === 'source' ? subscriptionId : null,
    group_id: view === 'group' ? groupId : null,
    date: view === 'timeline' ? date : null,
  })

  return ok({
    view,
    filters: {
      group_id: view === 'group' ? groupId : undefined,
      subscription_id: view === 'source' ? subscriptionId : undefined,
      date: view === 'timeline' ? date ?? undefined : undefined,
    },
    refreshed_at: page.refreshed_at,
    stale: page.stale,
    articles: page.articles.map(summarizeArticleForAgent),
    next_cursor: page.next_cursor,
    has_more: page.has_more,
    total: page.total,
    hint: '列表仅含摘要；正文须用 get_news_article(article_id)',
  }, `资讯列表 ${page.articles.length} 条`, t0)
}

export function newsArticleDetail(params: Record<string, unknown>, t0: number): ResearchResult {
  const articleId = typeof params.article_id === 'string' ? params.article_id.trim() : ''
  if (!articleId) return fail('article_id 必填', t0)

  const article = getArticle(articleId)
  if (!article) return fail(`未找到文章 id=${articleId}`, t0)

  const detail = formatArticleDetailForAgent(article)
  if (!detail.body_text && !detail.summary_text) {
    return ok({
      ...detail,
      body_text: compressNewsTextForAgent(article.title),
      note: '原文无正文，已回退为标题',
    }, '资讯正文', t0)
  }

  return ok(detail, '资讯正文', t0)
}
