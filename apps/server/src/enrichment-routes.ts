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
  resolveTranslationModelPath,
  shouldBootstrapSenseVoice,
  startSenseVoiceEnsureJob,
  getSenseVoiceEnsureJobStatus,
} from '@opptrix/local-inference'
import { resolveProjectRoot } from '@opptrix/agent'

/** 完成后保留窗口（轮询友好）；超时删除，避免 jobs Map 长跑无限涨 */
const JOB_TTL_MS = 10 * 60 * 1000
const MAX_JOBS = 64

type EnrichmentJobRecord = {
  articleId: string
  status: 'running' | 'completed' | 'failed'
  progress: EnrichmentProgress | null
  error?: string
  updatedAt: number
  expireTimer?: ReturnType<typeof setTimeout>
}

const jobs = new Map<string, EnrichmentJobRecord>()

const JOB_EXPIRED_ERROR = '识别任务已过期或不存在，请重新开始'

function newJobId(articleId: string): string {
  return `${articleId}:${Date.now()}`
}

function clearExpireTimer(job: EnrichmentJobRecord): void {
  if (job.expireTimer) {
    clearTimeout(job.expireTimer)
    job.expireTimer = undefined
  }
}

function touch(job: EnrichmentJobRecord): void {
  job.updatedAt = Date.now()
}

function scheduleJobRemoval(jobId: string): void {
  const job = jobs.get(jobId)
  if (!job || job.status === 'running') return
  clearExpireTimer(job)
  const timer = setTimeout(() => {
    const cur = jobs.get(jobId)
    if (!cur || cur.status === 'running') return
    jobs.delete(jobId)
  }, JOB_TTL_MS)
  timer.unref?.()
  job.expireTimer = timer
}

/** 驱逐过期与超额终态任务；running 不受误删 */
export function pruneEnrichmentJobs(now = Date.now()): void {
  for (const [id, job] of jobs) {
    if (job.status === 'running') continue
    if (now - job.updatedAt > JOB_TTL_MS) {
      clearExpireTimer(job)
      jobs.delete(id)
    }
  }
  while (jobs.size > MAX_JOBS) {
    const oldest = [...jobs.entries()]
      .filter(([, j]) => j.status !== 'running')
      .sort((a, b) => a[1].updatedAt - b[1].updatedAt)[0]
    if (!oldest) break
    clearExpireTimer(oldest[1])
    jobs.delete(oldest[0])
  }
}

function toPublicJob(job: EnrichmentJobRecord) {
  return {
    articleId: job.articleId,
    status: job.status,
    progress: job.progress,
    error: job.error,
  }
}

/** @internal 测试用 */
export function resetEnrichmentJobsForTests(): void {
  for (const job of jobs.values()) clearExpireTimer(job)
  jobs.clear()
}

/** @internal 测试用 */
export function enrichmentJobsSizeForTests(): number {
  return jobs.size
}

/** @internal 测试用：注入终态任务并立即按 TTL/上限修剪 */
export function injectEnrichmentJobForTests(
  jobId: string,
  partial: {
    articleId: string
    status: 'running' | 'completed' | 'failed'
    updatedAt?: number
    error?: string
  },
): void {
  const prev = jobs.get(jobId)
  if (prev) clearExpireTimer(prev)
  jobs.set(jobId, {
    articleId: partial.articleId,
    status: partial.status,
    progress: null,
    error: partial.error,
    updatedAt: partial.updatedAt ?? Date.now(),
  })
}

/** @internal 测试用 */
export function lookupEnrichmentJobForTests(jobId: string): EnrichmentJobRecord | undefined {
  pruneEnrichmentJobs()
  return jobs.get(jobId)
}

export const ENRICHMENT_JOB_TTL_MS = JOB_TTL_MS
export const ENRICHMENT_JOB_MAX = MAX_JOBS
export const ENRICHMENT_JOB_EXPIRED_ERROR = JOB_EXPIRED_ERROR

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

    pruneEnrichmentJobs()
    const settings = getNewsSettings()
    const jobId = newJobId(article.id)
    jobs.set(jobId, {
      articleId: article.id,
      status: 'running',
      progress: null,
      updatedAt: Date.now(),
    })

    void queueArticleEnrichment(
      article,
      settings.enrichment,
      resolveProjectRoot(),
      progress => {
        const job = jobs.get(jobId)
        if (job) {
          job.progress = progress
          touch(job)
          jobs.set(jobId, job)
        }
      },
    ).then(() => {
      const job = jobs.get(jobId)
      if (job) {
        job.status = 'completed'
        touch(job)
        jobs.set(jobId, job)
        scheduleJobRemoval(jobId)
      }
    }).catch(e => {
      const job = jobs.get(jobId)
      if (job) {
        job.status = 'failed'
        job.error = e instanceof Error ? e.message : String(e)
        touch(job)
        jobs.set(jobId, job)
        scheduleJobRemoval(jobId)
      }
    })

    return { job_id: jobId, article_id: article.id }
  })

  app.get<{ Params: { jobId: string } }>('/api/news/enrichment/jobs/:jobId', async (req, reply) => {
    pruneEnrichmentJobs()
    const job = jobs.get(req.params.jobId)
    if (!job) {
      return reply.code(404).send({
        error: JOB_EXPIRED_ERROR,
        expired: true,
      })
    }
    touch(job)
    const enrichment = getEnrichmentStore().get(job.articleId) ?? null
    return { job: toPublicJob(job), enrichment }
  })
}
