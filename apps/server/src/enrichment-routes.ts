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
  getDownloadState,
  isOfflineTranslationEnabled,
  maybeBootstrapTranslationModel,
  resolveTranslationModelPath,
  shouldBootstrapSenseVoice,
  startSenseVoiceEnsureJob,
  getSenseVoiceEnsureJobStatus,
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

function resolveSpeechModelName(): string {
  const settings = getNewsSettings()
  return settings.enrichment.offline_whisper_model?.trim() || 'q8'
}

function startSenseVoiceEnsureFromSettings() {
  const modelName = resolveSpeechModelName()
  const repoRoot = resolveProjectRoot()
  return startSenseVoiceEnsureJob(modelName, repoRoot)
}

export async function registerEnrichmentRoutes(app: FastifyInstance) {
  app.get('/api/news/multimodal/status', async () => {
    const settings = getNewsSettings()
    const repoRoot = resolveProjectRoot()
    const runtime = getMultimodalRuntimeStatus(
      repoRoot,
      settings.enrichment.offline_whisper_model,
    )
    const ensureJob = getSenseVoiceEnsureJobStatus(
      settings.enrichment.offline_whisper_model?.trim() || 'q8',
      repoRoot,
    )

    const cfg = loadConfig()
    const remoteProvider = settings.enrichment.remote_provider_id
      ? cfg.providers.find(p => p.id === settings.enrichment.remote_provider_id) ?? null
      : null
    const remoteConfigured = Boolean(
      settings.enrichment.remote_provider_id && settings.enrichment.remote_model,
    )

    const caps = canEnrichWithSettings(settings.enrichment, runtime.ffmpeg.ready)
    const translation = settings.translation
    const translationModelPath = resolveTranslationModelPath(repoRoot, translation.offline_model)
    const offlineTranslation = isOfflineTranslationEnabled(translation)

    return {
      settings: settings.enrichment,
      runtime,
      remoteConfigured,
      remoteProviderName: remoteProvider?.name ?? null,
      canEnrichImages: caps.images,
      canEnrichSpeech: caps.speech,
      canEnrich: caps.any,
      sensevoiceEnsure: ensureJob,
      translation: {
        offlineEnabled: offlineTranslation,
        modelInstalled: Boolean(translationModelPath),
        modelName: translationModelPath?.split(/[/\\]/).pop() ?? null,
        downloading: getDownloadState()?.status === 'downloading',
      },
    }
  })

  /** GET：轮询 ensure 进度（与语义模型 install GET 同形） */
  app.get('/api/news/multimodal/sensevoice/ensure', async () => {
    const modelName = resolveSpeechModelName()
    const repoRoot = resolveProjectRoot()
    return { job: getSenseVoiceEnsureJobStatus(modelName, repoRoot) }
  })

  /** POST：立即返回 job；后台下载。请轮询 GET 同路径或 multimodal/status.sensevoiceEnsure */
  app.post('/api/news/multimodal/sensevoice/ensure', async (_req, reply) => {
    const settings = getNewsSettings()
    if (!shouldBootstrapSenseVoice(settings.enrichment)) {
      return reply.code(400).send({ error: '请先开启媒体提取并勾选音视频转写' })
    }
    const job = startSenseVoiceEnsureFromSettings()
    return {
      ok: true,
      started: job.started
        || job.phase === 'preparing'
        || job.phase === 'downloading'
        || job.phase === 'ready',
      job,
    }
  })

  /** @deprecated 兼容旧客户端；代理到 SenseVoice ensure（异步 job） */
  app.get('/api/news/multimodal/whisper/ensure', async () => {
    const modelName = resolveSpeechModelName()
    const repoRoot = resolveProjectRoot()
    return { job: getSenseVoiceEnsureJobStatus(modelName, repoRoot) }
  })

  app.post('/api/news/multimodal/whisper/ensure', async (_req, reply) => {
    const settings = getNewsSettings()
    if (!shouldBootstrapSenseVoice(settings.enrichment)) {
      return reply.code(400).send({ error: '请先开启媒体提取并勾选音视频转写' })
    }
    const job = startSenseVoiceEnsureFromSettings()
    return {
      ok: true,
      started: job.started
        || job.phase === 'preparing'
        || job.phase === 'downloading'
        || job.phase === 'ready',
      job,
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
