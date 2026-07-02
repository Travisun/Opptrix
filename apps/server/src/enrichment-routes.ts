import type { FastifyInstance } from 'fastify'
import { getArticle, getNewsSettings } from '@opptrix/news-feed'
import { loadConfig } from './config.js'
import {
  getEnrichmentStore,
  queueArticleEnrichment,
  canEnrichWithSettings,
  type EnrichmentProgress,
} from '@opptrix/article-enrichment'
import {
  getMultimodalRuntimeStatus,
  whisperRuntime,
} from '@opptrix/local-inference'
import { resolveProjectRoot } from '@opptrix/agent'

const jobs = new Map<string, {
  articleId: string
  status: 'running' | 'completed' | 'failed'
  progress: EnrichmentProgress | null
  error?: string
}>()

function newJobId(articleId: string): string {
  return `${articleId}:${Date.now()}`
}

export async function registerEnrichmentRoutes(app: FastifyInstance) {
  app.get('/api/news/multimodal/status', async () => {
    const settings = getNewsSettings()
    const repoRoot = resolveProjectRoot()
    const runtime = getMultimodalRuntimeStatus(
      repoRoot,
      settings.enrichment.offline_whisper_model,
    )

    const cfg = loadConfig()
    const remoteProvider = settings.enrichment.remote_provider_id
      ? cfg.providers.find(p => p.id === settings.enrichment.remote_provider_id) ?? null
      : null
    const remoteConfigured = Boolean(
      settings.enrichment.remote_provider_id && settings.enrichment.remote_model,
    )

    const caps = canEnrichWithSettings(settings.enrichment, runtime.ffmpeg.ready)

    return {
      settings: settings.enrichment,
      runtime,
      remoteConfigured,
      remoteProviderName: remoteProvider?.name ?? null,
      canEnrichImages: caps.images,
      canEnrichSpeech: caps.speech,
      canEnrich: caps.any,
    }
  })

  app.post('/api/news/multimodal/whisper/ensure', async (_req, reply) => {
    const settings = getNewsSettings()
    const modelName = settings.enrichment.offline_whisper_model || 'tiny'
    try {
      await whisperRuntime.ensureModel(modelName)
      const runtime = getMultimodalRuntimeStatus(resolveProjectRoot(), modelName)
      return {
        ok: true,
        modelName,
        ready: runtime.whisper.ready,
        modelsDir: runtime.whisper.modelsDir,
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      return reply.code(400).send({ error: message })
    }
  })

  app.get<{ Params: { id: string } }>('/api/news/articles/:id/enrichment', async (req, reply) => {
    const article = getArticle(req.params.id)
    if (!article) return reply.code(404).send({ error: 'article not found' })
    const enrichment = getEnrichmentStore().get(article.id) ?? null
    return { enrichment }
  })

  app.post<{ Params: { id: string } }>('/api/news/articles/:id/enrich', async (req, reply) => {
    const article = getArticle(req.params.id)
    if (!article) return reply.code(404).send({ error: 'article not found' })

    const settings = getNewsSettings()
    const jobId = newJobId(article.id)
    jobs.set(jobId, { articleId: article.id, status: 'running', progress: null })

    void queueArticleEnrichment(
      article,
      settings.enrichment,
      resolveProjectRoot(),
      progress => {
        const job = jobs.get(jobId)
        if (job) {
          job.progress = progress
          jobs.set(jobId, job)
        }
      },
    ).then(() => {
      const job = jobs.get(jobId)
      if (job) {
        job.status = 'completed'
        jobs.set(jobId, job)
      }
    }).catch(e => {
      const job = jobs.get(jobId)
      if (job) {
        job.status = 'failed'
        job.error = e instanceof Error ? e.message : String(e)
        jobs.set(jobId, job)
      }
    })

    return { job_id: jobId, article_id: article.id }
  })

  app.get<{ Params: { jobId: string } }>('/api/news/enrichment/jobs/:jobId', async (req, reply) => {
    const job = jobs.get(req.params.jobId)
    if (!job) return reply.code(404).send({ error: 'job not found' })
    const enrichment = getEnrichmentStore().get(job.articleId) ?? null
    return { job, enrichment }
  })
}
