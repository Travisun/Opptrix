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
import {
  maybeBootstrapTranslationModel,
  shouldBootstrapSenseVoice,
  scheduleSenseVoiceEnsureJob,
} from '@opptrix/local-inference'
import { resolveProjectRoot } from '@opptrix/agent'
import {
  cancelTranslationModelDownload,
  getTranslationDownloadDirInfo,
  getTranslationModels,
  getTranslationStatus,
  startTranslationModelDownload,
  toUserFacingTranslationError,
  translateArticle,
} from './translation-local.js'

function scheduleOfflineModelBootstrap(settings: NewsSettings): void {
  void maybeBootstrapTranslationModel(settings.translation).catch(() => {})
  if (shouldBootstrapSenseVoice(settings.enrichment)) {
    const modelName = settings.enrichment.offline_whisper_model?.trim() || 'q8'
    const repoRoot = resolveProjectRoot()
    // 与显式 ensure 共用同一 job，避免双开下载
    scheduleSenseVoiceEnsureJob(modelName, repoRoot)
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

  app.get('/api/news/translation/status', async () => {
    const settings = getNewsSettings()
    return getTranslationStatus(settings.translation)
  })

  app.get('/api/news/translation/models', async () => getTranslationModels())

  app.get('/api/news/translation/download-dir', async () => getTranslationDownloadDirInfo())

  app.post<{ Body: { modelId?: string } }>('/api/news/translation/download', async (req, reply) => {
    const modelId = req.body?.modelId?.trim()
    if (!modelId) return reply.code(400).send({ error: 'modelId required' })
    try {
      return await startTranslationModelDownload(modelId)
    } catch (e) {
      return reply.code(400).send({ error: toUserFacingTranslationError(e) })
    }
  })

  app.post('/api/news/translation/download/cancel', async () => ({
    cancelled: cancelTranslationModelDownload(),
  }))

  app.post<{
    Body: {
      articleId?: string
      title?: string
      bodyText?: string
      segments?: Array<{ id: string; text: string; kind?: 'text' | 'html' }>
      targetLang?: string
      translation?: Partial<NewsTranslationSettings>
    }
    Querystring: { stream?: string }
  }>('/api/news/translate', async (req, reply) => {
    const settings = getNewsSettings()
    const translation = {
      ...settings.translation,
      ...(req.body?.translation ?? {}),
    }
    const payload = {
      articleId: req.body?.articleId ?? '',
      title: req.body?.title,
      bodyText: req.body?.bodyText,
      segments: req.body?.segments,
      targetLang: req.body?.targetLang,
    }

    const accept = String(req.headers.accept ?? '')
    const streamRequested = accept.includes('text/event-stream')
      || req.query?.stream === '1'
      || req.query?.stream === 'true'

    if (!streamRequested) {
      try {
        return await translateArticle(payload, translation)
      } catch (e) {
        return reply.code(400).send({ error: toUserFacingTranslationError(e) })
      }
    }

    reply.hijack()
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    })

    const writeEvent = (event: string, data: unknown) => {
      if (reply.raw.writableEnded) return
      reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
    }

    try {
      const result = await translateArticle(payload, translation, (progress) => {
        writeEvent('progress', progress)
      })
      writeEvent('result', result)
    } catch (e) {
      writeEvent('error', { error: toUserFacingTranslationError(e) })
    } finally {
      if (!reply.raw.writableEnded) reply.raw.end()
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
