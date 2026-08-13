const path = require('node:path')
const fs = require('node:fs/promises')
const { resolveTranslationModelPath, detectModelFamily } = require('./translation-paths.cjs')
const {
  TRANSLATION_MODEL_CATALOG,
  BOOTSTRAP_MODEL_IDS,
  listInstalledModels,
  isCatalogModelInstalled,
  getCatalogModel,
  getDefaultDownloadDir,
  formatBytes,
  getDefaultDownloadSourceLabel,
  getCatalogPurposeLabel,
} = require('./translation-model-catalog.cjs')
const {
  downloadTranslationModel,
  cancelTranslationModelDownload,
  getDownloadState,
  isDownloadActive,
} = require('./translation-download.cjs')
const {
  articleLikelyNeedsChineseTranslation,
  buildTranslatePrompt,
  buildHtmlTranslatePrompt,
  splitIntoChunks,
  cleanTranslationOutput,
  cleanBlockTranslationOutput,
  cleanHtmlTranslationOutput,
  normalizeWhitespace,
  estimateMaxTokens,
  estimateHtmlMaxTokens,
} = require('./translation-text.cjs')
const {
  getCachedTranslation,
  setCachedTranslation,
  flushTranslationCache,
} = require('./translation-cache.cjs')

const API_HOST = process.env.STOCK_RESEARCH_HOST ?? '127.0.0.1'
const API_PORT = process.env.STOCK_RESEARCH_PORT ?? '8711'

async function fetchNewsSettings() {
  const resp = await fetch(`http://${API_HOST}:${API_PORT}/api/news/settings`)
  if (!resp.ok) throw new Error('无法读取翻译设置')
  const data = await resp.json()
  return data.settings ?? {}
}

/** @type {import('node-llama-cpp').LlamaChatSession | null} */
let chatSession = null
/** @type {import('node-llama-cpp').LlamaModel | null} */
let model = null
/** @type {import('node-llama-cpp').LlamaContext | null} */
let llamaContext = null
let loadedModelPath = null
let loadingPromise = null
let preloadPromise = null
let loadedModelFamily = 'generic'
let lastLoadError = null

/** 对齐 embedding：默认 12 分钟空闲卸载；`OPPTRIX_TRANSLATION_IDLE_MS=0` 关闭 */
const DEFAULT_TRANSLATION_IDLE_MS = 12 * 60 * 1000
/** @type {ReturnType<typeof setTimeout> | null} */
let idleTimer = null
/** @type {Promise<void> | null} */
let idleUnloadPromise = null
let lastUsedAt = 0

/** @type {Map<string, string>} */
const segmentMemoryCache = new Map()
const SEGMENT_MEMORY_CACHE_MAX = 800

function resolveTranslationIdleMs() {
  const raw = process.env.OPPTRIX_TRANSLATION_IDLE_MS
  if (raw == null || raw === '') return DEFAULT_TRANSLATION_IDLE_MS
  const n = Number(raw)
  if (!Number.isFinite(n) || n < 0) return DEFAULT_TRANSLATION_IDLE_MS
  return n
}

function clearIdleTimer() {
  if (idleTimer) {
    clearTimeout(idleTimer)
    idleTimer = null
  }
}

function scheduleIdleUnload() {
  clearIdleTimer()
  const idleMs = resolveTranslationIdleMs()
  if (idleMs <= 0) return
  idleTimer = setTimeout(() => {
    idleTimer = null
    void runIdleUnload()
  }, idleMs)
  if (typeof idleTimer === 'object' && idleTimer && 'unref' in idleTimer) {
    idleTimer.unref()
  }
}

function touchLastUsed() {
  lastUsedAt = Date.now()
  scheduleIdleUnload()
}

/**
 * 按 node-llama-cpp 官方 API dispose；失败不抛。
 * @param {{ session?: { dispose?: Function, disposed?: boolean } | null, context?: { dispose?: Function, disposed?: boolean } | null, model?: { dispose?: Function, disposed?: boolean } | null }} handles
 */
async function disposeLlamaHandles(handles) {
  const run = async (label, fn) => {
    try {
      await fn()
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.warn(`[translation-service] ${label} dispose failed:`, msg)
    }
  }
  const { session, context, model: modelHandle } = handles
  if (session && typeof session.dispose === 'function' && !session.disposed) {
    await run('session', () => session.dispose({ disposeSequence: true }))
  }
  if (context && typeof context.dispose === 'function' && !context.disposed) {
    await run('context', () => context.dispose())
  }
  if (modelHandle && typeof modelHandle.dispose === 'function' && !modelHandle.disposed) {
    await run('model', () => modelHandle.dispose())
  }
}

function clearHeldRefs() {
  chatSession = null
  llamaContext = null
  model = null
  loadedModelPath = null
  loadedModelFamily = 'generic'
}

/** 释放当前模型句柄；保留 segmentMemoryCache LRU */
async function unloadHeldResources() {
  clearIdleTimer()
  const handles = {
    session: chatSession,
    context: llamaContext,
    model,
  }
  clearHeldRefs()
  await disposeLlamaHandles(handles)
}

async function runIdleUnload() {
  if (idleUnloadPromise) {
    await idleUnloadPromise
    return
  }
  idleUnloadPromise = unloadHeldResources()
    .catch(err => {
      const msg = err instanceof Error ? err.message : String(err)
      console.warn('[translation-service] idle unload failed:', msg)
    })
    .finally(() => {
      idleUnloadPromise = null
    })
  await idleUnloadPromise
}

function getGenerationProfile() {
  return {
    temperature: 0.7,
    topK: 20,
    topP: 0.6,
    repeatPenalty: 1.05,
  }
}

function getContextSize() {
  return 3072
}

function segmentMemoryKey(modelBasename, text) {
  return `${modelBasename}::${text}`
}

function getSegmentFromMemory(modelBasename, text) {
  return segmentMemoryCache.get(segmentMemoryKey(modelBasename, text)) ?? null
}

function setSegmentInMemory(modelBasename, text, translated) {
  const key = segmentMemoryKey(modelBasename, text)
  if (segmentMemoryCache.has(key)) {
    segmentMemoryCache.delete(key)
  }
  segmentMemoryCache.set(key, translated)
  while (segmentMemoryCache.size > SEGMENT_MEMORY_CACHE_MAX) {
    const oldest = segmentMemoryCache.keys().next().value
    if (!oldest) break
    segmentMemoryCache.delete(oldest)
  }
}

async function ensureChatSession(repoRoot, preferredModel = '__auto__') {
  const modelPath = resolveTranslationModelPath(repoRoot, preferredModel)
  if (!modelPath) {
    throw new Error('未找到本地翻译模型。请在设置中下载 HY-MT 模型，或手动放入 ~/.opptrix/llms')
  }

  const modelFamily = detectModelFamily(modelPath)

  for (;;) {
    if (chatSession && loadedModelPath === modelPath) {
      touchLastUsed()
      return { chatSession, modelPath, modelFamily: loadedModelFamily }
    }
    if (loadingPromise) {
      await loadingPromise
      continue
    }
    break
  }

  loadingPromise = (async () => {
    lastLoadError = null
    const family = detectModelFamily(modelPath)
    /** @type {import('node-llama-cpp').LlamaModel | null} */
    let nextModel = null
    /** @type {import('node-llama-cpp').LlamaContext | null} */
    let nextContext = null
    try {
      if (idleUnloadPromise) {
        try {
          await idleUnloadPromise
        } catch {
          /* ignore */
        }
      }
      if (chatSession || llamaContext || model || loadedModelPath) {
        await unloadHeldResources()
      }
      const { getLlama, LlamaChatSession } = await import('node-llama-cpp')
      const llama = await getLlama()
      nextModel = await llama.loadModel({
        modelPath,
        gpuLayers: process.platform === 'darwin' ? 'max' : 'auto',
      })
      nextContext = await nextModel.createContext({
        contextSize: getContextSize(),
        threads: 0,
      })
      chatSession = new LlamaChatSession({ contextSequence: nextContext.getSequence() })
      model = nextModel
      llamaContext = nextContext
      loadedModelPath = modelPath
      loadedModelFamily = family
      nextModel = null
      nextContext = null
      touchLastUsed()
    } catch (error) {
      await disposeLlamaHandles({ session: chatSession, context: nextContext ?? llamaContext, model: nextModel ?? model })
      chatSession = null
      llamaContext = null
      model = null
      loadedModelPath = null
      loadedModelFamily = 'generic'
      const message = error instanceof Error ? error.message : String(error)
      if (/invalid ggml type|failed to load model|failed to read tensor/i.test(message)) {
        lastLoadError = [
          '当前 GGUF 文件无法被本地推理引擎加载。',
          '请使用腾讯官方 HY-MT1.5-1.8B-GGUF 的 Q4_K_M 或 Q8_0 量化文件。',
          `模型路径：${modelPath}`,
        ].join('\n')
      } else {
        lastLoadError = message
      }
      throw new Error(lastLoadError)
    } finally {
      loadingPromise = null
    }
  })()

  await loadingPromise
  if (!chatSession) throw new Error(lastLoadError ?? '翻译模型加载失败')
  return { chatSession, modelPath, modelFamily: loadedModelFamily }
}

async function preloadTranslationModel(repoRoot) {
  if (chatSession || loadingPromise || preloadPromise) return

  let settings = null
  try {
    settings = await fetchNewsSettings()
  } catch {
    return
  }

  if (settings?.translation?.service_mode === 'remote') return

  const preferred = settings?.translation?.offline_model ?? '__auto__'
  if (!resolveTranslationModelPath(repoRoot, preferred)) return

  preloadPromise = ensureChatSession(repoRoot, preferred)
    .catch(() => {})
    .finally(() => {
      preloadPromise = null
    })

  await preloadPromise
}

async function translateSegment(session, sourceText, targetLang = 'Chinese', modelFamily = 'generic', kind = 'text') {
  session.resetChatHistory()
  const isHtml = kind === 'html'
  const prompt = isHtml
    ? buildHtmlTranslatePrompt(sourceText, targetLang)
    : buildTranslatePrompt(sourceText, targetLang)
  const raw = await session.prompt(prompt, {
    ...getGenerationProfile(),
    maxTokens: isHtml ? estimateHtmlMaxTokens(sourceText) : estimateMaxTokens(sourceText),
  })
  if (isHtml) {
    const cleaned = cleanHtmlTranslationOutput(raw, sourceText)
    return cleaned || String(raw ?? '').trim()
  }
  const cleaned = cleanBlockTranslationOutput(raw, sourceText)
  return cleaned || normalizeWhitespace(raw)
}

async function getTranslationStatus(repoRoot, settingsOverride = null) {
  let settings = settingsOverride
  if (!settings) {
    try {
      settings = await fetchNewsSettings()
    } catch {
      settings = { translation: { service_mode: 'offline', offline_model: '__auto__' } }
    }
  }

  const translation = settings?.translation ?? {}
  const preferredModel = translation.offline_model ?? '__auto__'
  const modelPath = resolveTranslationModelPath(repoRoot, preferredModel)
  const modelFamily = modelPath ? detectModelFamily(modelPath) : null
  const remoteConfigured = Boolean(translation.remote_provider_id && translation.remote_model)
  const localReady = Boolean(chatSession && modelPath && loadedModelPath === modelPath)
  const offlineModelAvailable = Boolean(modelPath)
  const serviceMode = translation.service_mode ?? 'offline'
  const canTranslate = serviceMode === 'remote'
    ? remoteConfigured
    : offlineModelAvailable || remoteConfigured

  return {
    supported: true,
    modelFound: Boolean(modelPath),
    modelPath: modelPath ?? null,
    modelName: modelPath ? path.basename(modelPath) : null,
    modelFamily,
    ready: localReady,
    loading: Boolean(loadingPromise || preloadPromise),
    lastError: lastLoadError,
    serviceMode,
    offlineModel: preferredModel,
    remoteConfigured,
    localAvailable: offlineModelAvailable,
    download: getDownloadState(),
    downloading: isDownloadActive(),
    canTranslate,
    downloadDir: getDefaultDownloadDir(),
  }
}

async function ensureTranslationDownloadDir() {
  const dir = getDefaultDownloadDir()
  await fs.mkdir(dir, { recursive: true })
  return dir
}

function getTranslationModels(repoRoot) {
  const installed = listInstalledModels(repoRoot)
  const installedNames = new Set(installed.map(item => item.filename))

  return {
    catalog: TRANSLATION_MODEL_CATALOG.map(item => ({
      ...item,
      sizeLabel: formatBytes(item.sizeBytes),
      installed: isCatalogModelInstalled(item, installedNames),
      purposeLabel: getCatalogPurposeLabel(item.purpose),
      downloadSource: getDefaultDownloadSourceLabel(),
    })),
    installed: installed.map(item => ({
      filename: item.filename,
      path: item.path,
      sizeLabel: formatBytes(item.sizeBytes),
    })),
    defaultDownloadSource: getDefaultDownloadSourceLabel(),
    downloadDir: getDefaultDownloadDir(),
  }
}

async function startTranslationModelDownload(repoRoot, modelId, onProgress) {
  const result = await downloadTranslationModel(modelId, onProgress)
  const model = getCatalogModel(modelId)
  if (model?.purpose === 'translation') {
    void preloadTranslationModel(repoRoot)
  }
  return result
}


function normalizeSegments(raw) {
  if (!Array.isArray(raw)) return []
  return raw
    .map(seg => ({
      id: String(seg?.id ?? '').trim(),
      text: String(seg?.text ?? '').trim(),
      kind: seg?.kind === 'html' ? 'html' : 'text',
    }))
    .filter(seg => seg.id && seg.text)
}

async function translateArticleLocal(repoRoot, payload, onProgress, preferredModel = '__auto__') {
  const articleId = String(payload?.articleId ?? '').trim()
  const title = String(payload?.title ?? '').trim()
  const bodyText = String(payload?.bodyText ?? '').trim()
  const segments = normalizeSegments(payload?.segments)
  const targetLang = String(payload?.targetLang ?? 'Chinese')

  const { chatSession: session, modelPath, modelFamily } = await ensureChatSession(repoRoot, preferredModel)
  const modelBasename = path.basename(modelPath)
  const cacheKey = `${articleId}::${modelBasename}::zh`
  const cached = getCachedTranslation(cacheKey)
  if (cached?.title != null && (cached?.segments?.length || cached?.body != null)) {
    return {
      title: cached.title,
      segments: cached.segments ?? [],
      body: cached.body,
      fromCache: true,
      engine: 'offline',
    }
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
      segments: segments.map(seg => ({ ...seg })),
      body: bodyText,
      skipped: true,
      message: '内容主要为中文，无需翻译',
      fromCache: false,
      engine: 'offline',
    }
  }

  const workSegments = segments.length
    ? segments.filter(seg => articleLikelyNeedsChineseTranslation(seg.text))
    : bodyNeeds
      ? splitIntoChunks(bodyText).map((text, index) => ({ id: String(index), text, kind: 'text' }))
      : []

  const total = workSegments.length + (titleNeeds ? 1 : 0)
  let current = 0

  let translatedTitle = title
  const translatedSegments = []
  const translatedById = new Map()

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

    let translated = getSegmentFromMemory(modelBasename, seg.text)
    if (!translated) {
      translated = await translateSegment(session, seg.text, targetLang, modelFamily, seg.kind)
      setSegmentInMemory(modelBasename, seg.text, translated)
    }

    translatedById.set(seg.id, translated)
    translatedSegments.push({ id: seg.id, text: translated })
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

  if (titleNeeds) {
    current += 1
    onProgress?.({ articleId, phase: 'title', current, total, engine: 'offline' })
    translatedTitle = await translateSegment(session, title, targetLang, modelFamily)
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
    : translatedSegments

  const translatedBody = orderedSegments.map(seg => seg.text).join('\n\n') || bodyText
  const result = {
    title: translatedTitle,
    segments: orderedSegments,
    body: translatedBody,
    fromCache: false,
    engine: 'offline',
  }
  setCachedTranslation(cacheKey, result)
  return result
}

async function translateArticleRemoteViaApi(repoRoot, payload, translation, onProgress) {
  const articleId = String(payload?.articleId ?? '').trim()
  onProgress?.({
    articleId,
    phase: 'segment',
    current: 0,
    total: 1,
    engine: 'remote',
  })

  const resp = await fetch(`http://${API_HOST}:${API_PORT}/api/news/translate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...payload,
      translation,
    }),
  })

  const data = await resp.json().catch(() => ({}))
  if (!resp.ok) {
    throw new Error(data.error ?? `远程翻译失败（HTTP ${resp.status}）`)
  }

  for (const seg of data.segments ?? []) {
    onProgress?.({
      articleId,
      phase: 'segment',
      current: 1,
      total: 1,
      segmentId: seg.id,
      translatedText: seg.text,
      done: true,
      engine: 'remote',
    })
  }
  if (data.title) {
    onProgress?.({
      articleId,
      phase: 'title',
      current: 1,
      total: 1,
      translatedTitle: data.title,
      done: true,
      engine: 'remote',
    })
  }

  return {
    ...data,
    engine: 'remote',
  }
}

async function translateArticle(repoRoot, payload, onProgress) {
  const articleId = String(payload?.articleId ?? '').trim()
  const title = String(payload?.title ?? '').trim()
  const bodyText = String(payload?.bodyText ?? '').trim()
  const segments = normalizeSegments(payload?.segments)

  if (!articleId) throw new Error('articleId 无效')
  if (!title && !bodyText && !segments.length) throw new Error('没有可翻译的正文')

  const settings = await fetchNewsSettings()
  const translation = settings?.translation ?? {}
  const preferredModel = translation.offline_model ?? '__auto__'
  const modelPath = resolveTranslationModelPath(repoRoot, preferredModel)
  const tryLocal = translation.service_mode !== 'remote' && Boolean(modelPath)

  if (tryLocal) {
    try {
      return await translateArticleLocal(repoRoot, payload, onProgress, preferredModel)
    } catch (localError) {
      if (!translation.remote_provider_id || !translation.remote_model) {
        throw localError
      }
    }
  }

  if (!translation.remote_provider_id || !translation.remote_model) {
    if (translation.service_mode === 'remote') {
      throw new Error('请先在设置中配置远程翻译的提供商与模型')
    }
    throw new Error('本地翻译模型不可用，且未配置远程翻译回退')
  }

  return translateArticleRemoteViaApi(repoRoot, payload, translation, onProgress)
}

async function maybeBootstrapOfflineModelDownloads(repoRoot, onProgress) {
  try {
    const settings = await fetchNewsSettings()
    if (settings?.translation?.service_mode === 'remote') return null

    const installed = listInstalledModels(repoRoot)
    const installedNames = new Set(installed.map(item => item.filename))

    for (const modelId of BOOTSTRAP_MODEL_IDS) {
      const model = getCatalogModel(modelId)
      if (!model || isCatalogModelInstalled(model, installedNames)) continue
      try {
        const result = await startTranslationModelDownload(repoRoot, modelId, onProgress)
        if (result?.filename) installedNames.add(result.filename)
      } catch {
        // 单个模型失败不阻断下一个
      }
    }
  } catch {
    return null
  }
  return null
}

async function disposeTranslation() {
  clearIdleTimer()
  const pending = idleUnloadPromise
  idleUnloadPromise = null
  if (pending) {
    try {
      await pending
    } catch {
      /* ignore */
    }
  }
  if (loadingPromise) {
    try {
      await loadingPromise
    } catch {
      /* ignore load failure during teardown */
    }
  }
  loadingPromise = null
  preloadPromise = null
  flushTranslationCache()
  // 保留 segmentMemoryCache LRU；仅释放 native 模型句柄
  await unloadHeldResources()
}

/**
 * @internal 测试注入已加载句柄
 * @param {{ chatSession?: unknown, model?: unknown, context?: unknown, loadedModelPath?: string | null }} handles
 */
function __setTranslationRuntimeForTests(handles = {}) {
  chatSession = handles.chatSession ?? null
  model = handles.model ?? null
  llamaContext = handles.context ?? null
  loadedModelPath = handles.loadedModelPath ?? null
}

/** @internal */
function __getTranslationRuntimeForTests() {
  return {
    chatSession,
    model,
    context: llamaContext,
    loadedModelPath,
    lastUsedAt,
    segmentMemoryCacheSize: segmentMemoryCache.size,
  }
}

module.exports = {
  getTranslationStatus,
  getTranslationModels,
  ensureTranslationDownloadDir,
  startTranslationModelDownload,
  cancelTranslationModelDownload,
  getDownloadState,
  maybeBootstrapOfflineModelDownloads,
  translateArticle,
  preloadTranslationModel,
  disposeTranslation,
  articleLikelyNeedsChineseTranslation,
  resolveTranslationIdleMs,
  DEFAULT_TRANSLATION_IDLE_MS,
  disposeLlamaHandles,
  __setTranslationRuntimeForTests,
  __getTranslationRuntimeForTests,
  __touchLastUsedForTests: touchLastUsed,
}
