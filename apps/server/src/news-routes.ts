import type { FastifyInstance } from 'fastify'
import {
  addSubscription,
  createGroup,
  deleteGroup,
  deleteSubscription,
  getArticle,
  getArticlesGrouped,
  getFeedArticles,
  getNewsSettings,
  importSubscriptions,
  listGroups,
  listSubscriptions,
  moveSubscriptionToGroup,
  parseSubscriptionExportPayload,
  refreshFeeds,
  reorderGroups,
  saveNewsSettings,
  saveSubscriptions,
  updateGroup,
  validateFeedUrl,
  type FeedSubscription,
  type NewsSettings,
  type NewsTranslationSettings,
} from '@opptrix/news-feed'
import { maybeBootstrapTranslationModel, shouldBootstrapWhisper, whisperRuntime } from '@opptrix/local-inference'
import { translateArticleRemote } from './translation-remote.js'

function scheduleOfflineModelBootstrap(settings: NewsSettings): void {
  void maybeBootstrapTranslationModel(settings.translation).catch(() => {})
  if (shouldBootstrapWhisper(settings.enrichment)) {
    const modelName = settings.enrichment.offline_whisper_model?.trim() || 'tiny'
    void whisperRuntime.ensureModel(modelName).catch(() => {})
  }
}

export async function registerNewsRoutes(app: FastifyInstance) {
  app.get('/api/news/settings', async () => ({
    settings: getNewsSettings(),
  }))

  app.put<{ Body: Partial<NewsSettings> }>('/api/news/settings', async (req) => {
    const cur = getNewsSettings()
    const next = saveNewsSettings({
      refresh_interval_min: req.body?.refresh_interval_min ?? cur.refresh_interval_min,
      retention_years: req.body?.retention_years ?? cur.retention_years,
      max_articles: req.body?.max_articles !== undefined ? req.body.max_articles : cur.max_articles,
      translation: {
        ...cur.translation,
        ...(req.body?.translation ?? {}),
      },
      enrichment: {
        ...cur.enrichment,
        ...(req.body?.enrichment ?? {}),
      },
    })
    scheduleOfflineModelBootstrap(next)
    return { settings: next }
  })

  app.post<{
    Body: {
      articleId?: string
      title?: string
      bodyText?: string
      segments?: Array<{ id: string; text: string; kind?: 'text' | 'html' }>
      targetLang?: string
      translation?: Partial<NewsTranslationSettings>
    }
  }>('/api/news/translate', async (req, reply) => {
    const settings = getNewsSettings()
    const translation = {
      ...settings.translation,
      ...(req.body?.translation ?? {}),
    }
    try {
      const result = await translateArticleRemote({
        articleId: req.body?.articleId ?? '',
        title: req.body?.title,
        bodyText: req.body?.bodyText,
        segments: req.body?.segments,
        targetLang: req.body?.targetLang,
      }, translation)
      return result
    } catch (e) {
      return reply.code(400).send({ error: e instanceof Error ? e.message : String(e) })
    }
  })

  app.get('/api/news/groups', async () => ({
    groups: listGroups(),
  }))

  app.post<{ Body: { title?: string } }>('/api/news/groups', async (req, reply) => {
    const title = req.body?.title?.trim()
    if (!title) return reply.code(400).send({ error: 'title required' })
    try {
      const group = createGroup(title)
      return { group, groups: listGroups() }
    } catch (e) {
      return reply.code(400).send({ error: e instanceof Error ? e.message : String(e) })
    }
  })

  app.put<{ Params: { id: string }; Body: { title?: string; sort_order?: number } }>(
    '/api/news/groups/:id',
    async (req, reply) => {
      try {
        const group = updateGroup(req.params.id, req.body ?? {})
        return { group, groups: listGroups() }
      } catch (e) {
        return reply.code(400).send({ error: e instanceof Error ? e.message : String(e) })
      }
    },
  )

  app.delete<{ Params: { id: string } }>('/api/news/groups/:id', async (req) => ({
    deleted: deleteGroup(req.params.id),
    groups: listGroups(),
    subscriptions: listSubscriptions(),
  }))

  app.put<{ Body: { group_ids?: string[] } }>('/api/news/groups/reorder', async (req) => ({
    groups: reorderGroups(Array.isArray(req.body?.group_ids) ? req.body.group_ids : []),
  }))

  app.get('/api/news/subscriptions', async () => ({
    subscriptions: listSubscriptions(),
    groups: listGroups(),
  }))

  app.put<{ Body: { subscriptions?: FeedSubscription[] } }>('/api/news/subscriptions', async (req) => {
    const subs = Array.isArray(req.body?.subscriptions) ? req.body.subscriptions : []
    return { subscriptions: saveSubscriptions(subs) }
  })

  app.put<{ Params: { id: string }; Body: { group_id?: string | null } }>(
    '/api/news/subscriptions/:id/group',
    async (req, reply) => {
      try {
        const sub = moveSubscriptionToGroup(req.params.id, req.body?.group_id ?? null)
        return { subscription: sub, subscriptions: listSubscriptions() }
      } catch (e) {
        return reply.code(400).send({ error: e instanceof Error ? e.message : String(e) })
      }
    },
  )

  app.delete<{ Params: { id: string } }>('/api/news/subscriptions/:id', async (req) => ({
    deleted: deleteSubscription(req.params.id),
    subscriptions: listSubscriptions(),
  }))

  app.post<{ Body: { url?: string; title?: string; enabled?: boolean; group_id?: string | null } }>(
    '/api/news/subscriptions/item',
    async (req, reply) => {
      const url = req.body?.url?.trim()
      if (!url) return reply.code(400).send({ error: 'url required' })
      try {
        const sub = await addSubscription({
          url,
          title: req.body?.title,
          enabled: req.body?.enabled,
          group_id: req.body?.group_id ?? null,
        })
        return { subscription: sub, subscriptions: listSubscriptions() }
      } catch (e) {
        return reply.code(400).send({ error: e instanceof Error ? e.message : String(e) })
      }
    },
  )

  app.post<{ Body: unknown }>('/api/news/subscriptions/import', async (req, reply) => {
    const parsed = parseSubscriptionExportPayload(req.body)
    if (!parsed.ok) return reply.code(400).send({ error: parsed.error })
    const result = await importSubscriptions(parsed.data.subscriptions)
    return {
      ...result,
      subscriptions: listSubscriptions(),
    }
  })

  app.post<{ Body: { url?: string; title?: string } }>('/api/news/validate', async (req, reply) => {
    const url = req.body?.url?.trim()
    if (!url) return reply.code(400).send({ error: 'url required' })
    const result = await validateFeedUrl({ url, title: req.body?.title })
    return { result }
  })

  app.get<{
    Querystring: {
      limit?: string
      cursor?: string
      subscription_id?: string
      group_id?: string
      date?: string
    }
  }>('/api/news/feed', async (req) => {
    const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 20) || 20))
    const data = getFeedArticles({
      limit,
      cursor: req.query.cursor ?? null,
      subscription_id: req.query.subscription_id ?? null,
      group_id: req.query.group_id ?? null,
      date: req.query.date ?? null,
    })
    return {
      articles: data.articles,
      next_cursor: data.next_cursor,
      has_more: data.has_more,
      total: data.total,
      refreshed_at: data.refreshed_at,
      stale: data.stale,
    }
  })

  app.get('/api/news/feed/grouped', async () => getArticlesGrouped())

  app.get<{ Params: { id: string } }>('/api/news/articles/:id', async (req, reply) => {
    const article = getArticle(req.params.id)
    if (!article) return reply.code(404).send({ error: 'article not found' })
    return { article }
  })

  app.post('/api/news/refresh', async () => {
    /** Manual RSS pull — settings「立即刷新」等；新闻中心列表刷新不走此接口。 */
    const result = await refreshFeeds(true)
    return {
      refreshed: result.refreshed,
      errors: result.errors,
      articles: result.page.articles,
      next_cursor: result.page.next_cursor,
      has_more: result.page.has_more,
      total: result.page.total,
    }
  })
}
