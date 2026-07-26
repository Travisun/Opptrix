import {
  addSubscription,
  compressNewsTextForAgent,
  createGroup,
  deleteGroup,
  deleteSubscription,
  formatArticleDetailForAgent,
  summarizeArticleForAgent,
  getArticle,
  getFeedArticles,
  getNewsFeedStore,
  getNewsSettings,
  importSubscriptions,
  listGroups,
  listSubscriptions,
  moveSubscriptionToGroup,
  parseSubscriptionExportPayload,
  shouldAutoRefresh,
  updateGroup,
  validateFeedUrl,
} from '@opptrix/news-feed'
import {
  getEnrichmentStore,
  queueArticleEnrichment,
} from '@opptrix/article-enrichment'
import { resolveProjectRoot, inferNewsSourceHints } from '@opptrix/shared'
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
    ...inferNewsSourceHints(g.title),
  }))
  const ungroupedCount = subs.filter(s => !s.group_id).length
  return ok({
    groups: items,
    ungrouped_subscription_count: ungroupedCount,
    hint: '按分组浏览文章时 list_news_articles 传 view=group 与 group_id；未分组订阅用 group_id=__ungrouped__；market_hints 供 Agent 按标的 market 优先选择',
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
    ...inferNewsSourceHints(s.title, s.url),
  }))
  return ok({
    sources: items,
    hint: '按来源浏览文章时 list_news_articles 传 view=source 与 subscription_id；market_hints/relevance 供 Agent 按标的优先筛选来源',
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

export async function newsArticleDetail(params: Record<string, unknown>, t0: number): Promise<ResearchResult> {
  const articleId = typeof params.article_id === 'string' ? params.article_id.trim() : ''
  if (!articleId) return fail('article_id 必填', t0)

  const article = getArticle(articleId)
  if (!article) return fail(`未找到文章 id=${articleId}`, t0)

  const settings = getNewsSettings()
  let enrichment = getEnrichmentStore().get(articleId) ?? null

  if (settings.enrichment.enabled && settings.enrichment.processing_mode === 'on_demand') {
    const needsEnrich = !enrichment
      || enrichment.status === 'pending'
      || (enrichment.status === 'failed' && !enrichment.segments.length)
    if (needsEnrich && enrichment?.status !== 'running') {
      try {
        enrichment = await queueArticleEnrichment(
          article,
          settings.enrichment,
          resolveProjectRoot(),
        )
      } catch {
        /* 按需提取失败时仍返回 HTML 正文 */
      }
    }
  } else if (enrichment?.status === 'running') {
    enrichment = getEnrichmentStore().get(articleId) ?? enrichment
  }

  const detail = formatArticleDetailForAgent(article, enrichment)
  if (!detail.body_text && !detail.summary_text) {
    return ok({
      ...detail,
      body_text: compressNewsTextForAgent(article.title),
      note: '原文无正文，已回退为标题',
    }, '资讯正文', t0)
  }

  return ok(detail, '资讯正文', t0)
}

function asOptionalTrimmedString(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined
  const s = raw.trim()
  return s || undefined
}

function asGroupId(raw: unknown): string | null {
  if (raw == null || raw === '') return null
  if (typeof raw !== 'string') return null
  const s = raw.trim()
  if (!s || s === '__ungrouped__') return null
  return s
}

export async function newsSourceAdd(params: Record<string, unknown>, t0: number): Promise<ResearchResult> {
  const url = asOptionalTrimmedString(params.url)
  if (!url) return fail('订阅地址不能为空', t0)
  try {
    const subscription = await addSubscription({
      url,
      title: asOptionalTrimmedString(params.title),
      group_id: asGroupId(params.group_id),
      enabled: params.enabled !== false,
    })
    return ok({
      subscription,
      hint: '已添加订阅；可用 list_news_sources 核对，或 list_news_articles(view=source) 浏览该来源',
    }, `已添加订阅「${subscription.title}」`, t0)
  } catch (e) {
    return fail(e instanceof Error ? e.message : '添加订阅失败', t0)
  }
}

export function newsSourceDelete(params: Record<string, unknown>, t0: number): ResearchResult {
  const id = asOptionalTrimmedString(params.subscription_id) ?? asOptionalTrimmedString(params.id)
  if (!id) return fail('subscription_id 必填', t0)
  const existing = listSubscriptions().find(s => s.id === id)
  if (!existing) return fail('找不到该订阅来源', t0)
  const deleted = deleteSubscription(id)
  if (!deleted) return fail('删除订阅失败', t0)
  return ok({
    deleted: true,
    subscription_id: id,
    title: existing.title,
  }, `已删除订阅「${existing.title}」`, t0)
}

export async function newsSourcesImport(params: Record<string, unknown>, t0: number): Promise<ResearchResult> {
  let raw: unknown = params
  if (Array.isArray(params.subscriptions) && params.schema_version == null) {
    raw = { schema_version: 1, subscriptions: params.subscriptions }
  } else if (params.payload != null) {
    raw = params.payload
  } else if (params.schema_version != null || params.subscriptions != null) {
    raw = {
      schema_version: params.schema_version ?? 1,
      subscriptions: params.subscriptions,
    }
  }

  const parsed = parseSubscriptionExportPayload(raw)
  if (!parsed.ok) return fail(parsed.error, t0)

  try {
    const result = await importSubscriptions(parsed.data.subscriptions)
    return ok({
      ...result,
      subscription_count: listSubscriptions().length,
      hint: '导入完成；可用 list_news_sources 查看新增来源',
    }, `导入完成：新增 ${result.added}，跳过 ${result.skipped}，失败 ${result.errors.length}`, t0)
  } catch (e) {
    return fail(e instanceof Error ? e.message : '导入订阅失败', t0)
  }
}

export function newsGroupCreate(params: Record<string, unknown>, t0: number): ResearchResult {
  const title = asOptionalTrimmedString(params.title)
  if (!title) return fail('分组名称不能为空', t0)
  try {
    const group = createGroup(title)
    return ok({
      group,
      groups: listGroups(),
      hint: '可用 move_news_source 把订阅移入该分组',
    }, `已创建分组「${group.title}」`, t0)
  } catch (e) {
    return fail(e instanceof Error ? e.message : '创建分组失败', t0)
  }
}

export function newsGroupUpdate(params: Record<string, unknown>, t0: number): ResearchResult {
  const id = asOptionalTrimmedString(params.group_id) ?? asOptionalTrimmedString(params.id)
  if (!id) return fail('group_id 必填', t0)
  const title = asOptionalTrimmedString(params.title)
  const sortRaw = params.sort_order
  const sort_order = typeof sortRaw === 'number' && Number.isFinite(sortRaw)
    ? sortRaw
    : undefined
  if (title == null && sort_order == null) {
    return fail('请提供 title 或 sort_order', t0)
  }
  try {
    const group = updateGroup(id, {
      ...(title != null ? { title } : {}),
      ...(sort_order != null ? { sort_order } : {}),
    })
    return ok({ group, groups: listGroups() }, `已更新分组「${group.title}」`, t0)
  } catch (e) {
    return fail(e instanceof Error ? e.message : '更新分组失败', t0)
  }
}

export function newsGroupDelete(params: Record<string, unknown>, t0: number): ResearchResult {
  const id = asOptionalTrimmedString(params.group_id) ?? asOptionalTrimmedString(params.id)
  if (!id) return fail('group_id 必填', t0)
  const existing = listGroups().find(g => g.id === id)
  if (!existing) return fail('找不到该分组', t0)
  const deleted = deleteGroup(id)
  if (!deleted) return fail('删除分组失败', t0)
  return ok({
    deleted: true,
    group_id: id,
    title: existing.title,
    note: '分组内订阅已改为未分组，订阅本身未删除',
  }, `已删除分组「${existing.title}」`, t0)
}

export function newsSourceMoveGroup(params: Record<string, unknown>, t0: number): ResearchResult {
  const subscriptionId = asOptionalTrimmedString(params.subscription_id) ?? asOptionalTrimmedString(params.id)
  if (!subscriptionId) return fail('subscription_id 必填', t0)
  const groupId = asGroupId(params.group_id)
  try {
    const subscription = moveSubscriptionToGroup(subscriptionId, groupId)
    return ok({
      subscription,
      hint: groupId
        ? '已移入指定分组'
        : '已移出分组（未分组）',
    }, `已移动订阅「${subscription.title}」`, t0)
  } catch (e) {
    return fail(e instanceof Error ? e.message : '移动订阅失败', t0)
  }
}

export async function newsSourceValidate(params: Record<string, unknown>, t0: number): Promise<ResearchResult> {
  const url = asOptionalTrimmedString(params.url)
  if (!url) return fail('订阅地址不能为空', t0)
  const result = await validateFeedUrl({
    url,
    title: asOptionalTrimmedString(params.title),
  })
  if (!result.ok) {
    return fail(result.error || '订阅源验证失败', t0)
  }
  return ok({
    result,
    hint: '验证通过后可用 add_news_source 添加',
  }, `订阅源可用：${result.title}（${result.item_count} 条）`, t0)
}
