import path from 'node:path'
import type { NewsTranslationSettings } from '@opptrix/news-feed'
import {
  MODEL_CATALOG,
  cancelModelDownload,
  downloadCatalogModel,
  formatBytes,
  getCatalogModel,
  getCatalogPurposeLabel,
  getDefaultDownloadSourceLabel,
  getDownloadState,
  isCatalogModelInstalled,
  isDownloadActive,
  llamaRuntime,
  listInstalledGgufModels,
  resolveTranslationModelPath,
  type DownloadProgress,
} from '@opptrix/local-inference'
import { resolveProjectRoot } from '@opptrix/agent'
import {
  articleLikelyNeedsChineseTranslation,
  splitIntoChunks,
} from './translation-text.js'
import {
  translateArticleRemote,
  type RemoteTranslationPayload,
} from './translation-remote.js'
import {
  buildArticleTranslationCacheKey,
  getCachedTranslation,
  setCachedTranslation,
} from './translation-cache.js'

export type TranslationProgress = {
  articleId: string
  phase: 'loading' | 'title' | 'segment'
  current: number
  total: number
  engine?: 'offline' | 'remote'
  segmentId?: string
  translatedText?: string
  translatedTitle?: string
  done?: boolean
}

export type TranslationArticleResult = {
  title: string
  segments: Array<{ id: string; text: string; kind?: 'text' | 'html' }>
  body: string
  engine: 'offline' | 'remote'
  fromCache?: boolean
  skipped?: boolean
  message?: string
}

export type TranslationEngineStatus = {
  supported: boolean
  modelFound: boolean
  modelPath: string | null
  modelName: string | null
  modelFamily: string | null
  ready: boolean
  loading: boolean
  lastError: string | null
  serviceMode: NewsTranslationSettings['service_mode']
  offlineModel: string
  remoteConfigured: boolean
  localAvailable: boolean
  download: DownloadProgress | null
  downloading: boolean
  canTranslate: boolean
  /** 相对数据根的目录标签，避免向 UI 暴露本机绝对路径 */
  downloadDirLabel: string
}

export type TranslationPlan = {
  tryOffline: boolean
  remoteConfigured: boolean
  preferredModel: string
  modelPath: string | null
}

let lastOfflineError: string | null = null

function detectModelFamily(modelPath: string | null): string | null {
  if (!modelPath) return null
  const name = path.basename(modelPath).toLowerCase()
  if (/hy[-_]?mt/i.test(name)) return 'hy-mt'
  return 'generic'
}

/** 去掉绝对路径等实现细节，面向设置 / 翻译错误文案 */
export function toUserFacingTranslationError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  if (/invalid ggml type|failed to load model|failed to read tensor/i.test(message)) {
    return '当前翻译模型无法加载。请使用 HY-MT1.5-1.8B 的 Q4_K_M 或 Q8_0 量化文件。'
  }
  if (/未找到本地翻译模型/.test(message)) {
    return '未找到本地翻译模型。请在设置中下载 HY-MT 模型后再试。'
  }
  if (/已有模型正在下载/.test(message)) {
    return message
  }
  if (/未找到该模型|未找到该离线翻译模型/.test(message)) {
    return '未找到该翻译模型，请从目录中选择后再下载。'
  }
  return message
    .replace(/\/(?:Users|home|root|var|tmp|opt|app|data|models)[^\s"'`]+/gi, '（本地文件）')
    .replace(/[A-Za-z]:\\[^\s"'`]+/g, '（本地文件）')
}

export function resolveTranslationPlan(
  translation: NewsTranslationSettings,
  repoRoot?: string,
): TranslationPlan {
  const preferredModel = translation.offline_model?.trim() || '__auto__'
  const modelPath = resolveTranslationModelPath(repoRoot, preferredModel)
  const remoteConfigured = Boolean(translation.remote_provider_id && translation.remote_model)
  const tryOffline = translation.service_mode !== 'remote' && Boolean(modelPath)
  return { tryOffline, remoteConfigured, preferredModel, modelPath }
}

function normalizeSegments(
  raw: RemoteTranslationPayload['segments'],
): Array<{ id: string; text: string; kind: 'text' | 'html' }> {
  if (!Array.isArray(raw)) return []
  return raw
    .map(seg => ({
      id: String(seg?.id ?? '').trim(),
      text: String(seg?.text ?? '').trim(),
      kind: seg?.kind === 'html' ? 'html' as const : 'text' as const,
    }))
    .filter(seg => seg.id && seg.text)
}

function publicDownload(state: DownloadProgress | null): DownloadProgress | null {
  if (!state) return null
  const { filePath: _filePath, ...rest } = state
  return { ...rest }
}

export function getTranslationStatus(
  translation: NewsTranslationSettings,
  repoRoot = resolveProjectRoot(),
): TranslationEngineStatus {
  const preferredModel = translation.offline_model?.trim() || '__auto__'
  const modelPath = resolveTranslationModelPath(repoRoot, preferredModel)
  const modelName = modelPath ? path.basename(modelPath) : null
  const remoteConfigured = Boolean(translation.remote_provider_id && translation.remote_model)
  const offlineModelAvailable = Boolean(modelPath)
  const serviceMode = translation.service_mode ?? 'offline'
  const loadedPath = llamaRuntime.getLoadedModelPath()
  const localReady = Boolean(modelPath && loadedPath && loadedPath === modelPath)
  const canTranslate = serviceMode === 'remote'
    ? remoteConfigured
    : offlineModelAvailable || remoteConfigured

  return {
    supported: true,
    modelFound: Boolean(modelPath),
    /** 仅文件名，避免向客户端暴露绝对路径 */
    modelPath: modelName,
    modelName,
    modelFamily: detectModelFamily(modelPath),
    /** 模型已在内存，或文件已就绪可即时加载 */
    ready: localReady || offlineModelAvailable,
    loading: llamaRuntime.isLoading(),
    lastError: lastOfflineError,
    serviceMode,
    offlineModel: preferredModel,
    remoteConfigured,
    localAvailable: offlineModelAvailable,
    download: publicDownload(getDownloadState()),
    downloading: isDownloadActive(),
    canTranslate,
    downloadDirLabel: 'llms',
  }
}

export function getTranslationModels(repoRoot = resolveProjectRoot()) {
  const installed = listInstalledGgufModels(repoRoot)
  const installedNames = new Set(installed.map(item => item.filename))

  return {
    catalog: MODEL_CATALOG.map(item => ({
      id: item.id,
      name: item.name,
      filename: item.filename,
      sizeBytes: item.sizeBytes,
      sizeLabel: formatBytes(item.sizeBytes),
      family: item.family,
      purpose: item.purpose,
      purposeLabel: getCatalogPurposeLabel(item.purpose),
      recommended: item.recommended,
      installed: isCatalogModelInstalled(item, installedNames),
      downloadSource: getDefaultDownloadSourceLabel(),
    })),
    installed: installed.map(item => ({
      filename: item.filename,
      path: item.filename,
      sizeLabel: formatBytes(item.sizeBytes),
    })),
    defaultDownloadSource: getDefaultDownloadSourceLabel(),
    downloadDirLabel: 'llms',
  }
}

export async function startTranslationModelDownload(modelId: string): Promise<{
  started: boolean
  download: DownloadProgress | null
  alreadyPresent?: boolean
}> {
  const id = modelId.trim()
  if (!id) throw new Error('modelId 无效')
  if (isDownloadActive()) {
    return { started: false, download: publicDownload(getDownloadState()) }
  }

  const model = getCatalogModel(id)
  if (!model) throw new Error('未找到该翻译模型')

  const job = downloadCatalogModel(id)
  const inFlight = getDownloadState()
  if (inFlight) {
    void job.catch(err => {
      lastOfflineError = toUserFacingTranslationError(err)
    })
    return { started: true, download: publicDownload(inFlight) }
  }

  try {
    const result = await job
    return {
      started: true,
      alreadyPresent: true,
      download: {
        modelId: id,
        filename: result.filename,
        status: 'completed',
        receivedBytes: model.sizeBytes,
        totalBytes: model.sizeBytes,
      },
    }
  } catch (error) {
    lastOfflineError = toUserFacingTranslationError(error)
    throw new Error(lastOfflineError)
  }
}

export function cancelTranslationModelDownload(): boolean {
  return cancelModelDownload()
}

export function getTranslationDownloadDirInfo(): { downloadDirLabel: string } {
  return { downloadDirLabel: 'llms' }
}

async function translateArticleOffline(
  payload: RemoteTranslationPayload,
  preferredModel: string,
  repoRoot: string,
  onProgress?: (progress: TranslationProgress) => void,
): Promise<TranslationArticleResult> {
  const articleId = String(payload.articleId ?? '').trim()
  const title = String(payload.title ?? '').trim()
  const bodyText = String(payload.bodyText ?? '').trim()
  const segments = normalizeSegments(payload.segments)
  const targetLang = String(payload.targetLang ?? 'Chinese')

  const modelPath = resolveTranslationModelPath(repoRoot, preferredModel)
  if (!modelPath) throw new Error('未找到本地翻译模型')

  const modelBasename = path.basename(modelPath)
  const cacheKey = buildArticleTranslationCacheKey(articleId, modelBasename)
  const cached = getCachedTranslation(cacheKey)
  if (
    cached
    && typeof cached.title === 'string'
    && (
      (Array.isArray(cached.segments) && cached.segments.length > 0)
      || typeof cached.body === 'string'
    )
  ) {
    const cachedSegments = Array.isArray(cached.segments)
      ? cached.segments
        .map((seg) => {
          if (!seg || typeof seg !== 'object') return null
          const row = seg as { id?: unknown; text?: unknown; kind?: unknown }
          const id = String(row.id ?? '').trim()
          const text = String(row.text ?? '')
          if (!id) return null
          return {
            id,
            text,
            kind: row.kind === 'html' ? 'html' as const : 'text' as const,
          }
        })
        .filter((seg): seg is { id: string; text: string; kind: 'text' | 'html' } => seg !== null)
      : []
    return {
      title: cached.title,
      segments: cachedSegments,
      body: typeof cached.body === 'string'
        ? cached.body
        : cachedSegments.map(seg => seg.text).join('\n\n'),
      fromCache: true,
      engine: 'offline',
    }
  }

  const needsColdLoad = llamaRuntime.getLoadedModelPath() !== modelPath
  if (needsColdLoad && onProgress) {
    onProgress({
      articleId,
      phase: 'loading',
      current: 0,
      total: 0,
      engine: 'offline',
    })
  }

  const titleNeeds = title ? articleLikelyNeedsChineseTranslation(title) : false
  const bodyNeeds = segments.length
    ? segments.some(seg => articleLikelyNeedsChineseTranslation(seg.text))
    : bodyText
      ? articleLikelyNeedsChineseTranslation(bodyText)
      : false

  if (!titleNeeds && !bodyNeeds) {
    return {
      title,
      segments: segments.length ? segments : [],
      body: segments.length ? segments.map(seg => seg.text).join('\n\n') : bodyText,
      skipped: true,
      message: '内容主要为中文，无需翻译',
      fromCache: false,
      engine: 'offline',
    }
  }

  const workSegments = segments.length
    ? segments.filter(seg => articleLikelyNeedsChineseTranslation(seg.text))
    : bodyNeeds
      ? splitIntoChunks(bodyText).map((text, index) => ({
        id: String(index),
        text,
        kind: 'text' as const,
      }))
      : []

  const total = workSegments.length + (titleNeeds ? 1 : 0)
  let current = 0
  const translatedById = new Map<string, string>()

  for (const seg of segments) {
    if (!articleLikelyNeedsChineseTranslation(seg.text)) {
      translatedById.set(seg.id, seg.text)
    }
  }

  for (const seg of workSegments) {
    current += 1
    onProgress?.({
      articleId,
      phase: 'segment',
      current,
      total,
      segmentId: seg.id,
      engine: 'offline',
    })

    const translated = await llamaRuntime.translateSegment(
      seg.text,
      targetLang,
      seg.kind,
      repoRoot,
      preferredModel,
    )
    translatedById.set(seg.id, translated)
    onProgress?.({
      articleId,
      phase: 'segment',
      current,
      total,
      segmentId: seg.id,
      translatedText: translated,
      done: true,
      engine: 'offline',
    })
  }

  let translatedTitle = title
  if (titleNeeds) {
    current += 1
    onProgress?.({ articleId, phase: 'title', current, total, engine: 'offline' })
    translatedTitle = await llamaRuntime.translateSegment(
      title,
      targetLang,
      'text',
      repoRoot,
      preferredModel,
    )
    onProgress?.({
      articleId,
      phase: 'title',
      current,
      total,
      translatedTitle,
      done: true,
      engine: 'offline',
    })
  }

  const orderedSegments = segments.length
    ? segments.map(seg => ({
      id: seg.id,
      text: translatedById.get(seg.id) ?? seg.text,
      kind: seg.kind,
    }))
    : workSegments.map(seg => ({
      id: seg.id,
      text: translatedById.get(seg.id) ?? seg.text,
      kind: seg.kind,
    }))

  const result: TranslationArticleResult = {
    title: translatedTitle,
    segments: orderedSegments,
    body: orderedSegments.map(seg => seg.text).join('\n\n') || bodyText,
    fromCache: false,
    engine: 'offline',
  }
  setCachedTranslation(cacheKey, {
    title: result.title,
    segments: result.segments,
    body: result.body,
    engine: result.engine,
  })
  return result
}

/**
 * 与 Electron `translateArticle` 一致：非 remote 且本地有模型时优先离线，失败且已配置远程则回退。
 */
export async function translateArticle(
  payload: RemoteTranslationPayload,
  translation: NewsTranslationSettings,
  onProgress?: (progress: TranslationProgress) => void,
  repoRoot = resolveProjectRoot(),
): Promise<TranslationArticleResult> {
  const articleId = String(payload.articleId ?? '').trim()
  const title = String(payload.title ?? '').trim()
  const bodyText = String(payload.bodyText ?? '').trim()
  const segments = normalizeSegments(payload.segments)

  if (!articleId) throw new Error('articleId 无效')
  if (!title && !bodyText && !segments.length) throw new Error('没有可翻译的正文')

  const plan = resolveTranslationPlan(translation, repoRoot)

  if (plan.tryOffline) {
    try {
      const result = await translateArticleOffline(
        payload,
        plan.preferredModel,
        repoRoot,
        onProgress,
      )
      lastOfflineError = null
      return result
    } catch (localError) {
      lastOfflineError = toUserFacingTranslationError(localError)
      if (!plan.remoteConfigured) {
        throw new Error(lastOfflineError)
      }
    }
  }

  if (!plan.remoteConfigured) {
    if (translation.service_mode === 'remote') {
      throw new Error('请先在设置中配置远程翻译的提供商与模型')
    }
    throw new Error(lastOfflineError ?? '本地翻译模型不可用，且未配置远程翻译回退')
  }

  const remote = await translateArticleRemote(
    payload,
    translation,
    onProgress
      ? (progress) => {
        onProgress({ ...progress, engine: 'remote' })
      }
      : undefined,
  )
  return {
    ...remote,
    engine: 'remote',
  }
}
