/**
 * Desktop translation IPC → local Fastify news API (no in-process llama).
 * Mirrors speech-whisper.cjs: read STOCK_RESEARCH_HOST/PORT on every call.
 */
const fs = require('node:fs/promises')
const { getDefaultDownloadDir } = require('./translation-model-catalog.cjs')

const DEFAULT_TIMEOUT_MS = 15_000
/** Cold load + long articles — align with client LOCAL_HEAVY_TIMEOUT */
const TRANSLATE_TIMEOUT_MS = 180_000

/**
 * 每次调用读 env：本模块在 main 顶部 require，早于 initResolvedPorts() 可能 bump STOCK_RESEARCH_PORT。
 * 勿在模块级固化 HOST/PORT。
 */
function apiBase() {
  const host = process.env.STOCK_RESEARCH_HOST ?? '127.0.0.1'
  const port = process.env.STOCK_RESEARCH_PORT ?? '8711'
  return `http://${host}:${port}/api/news`
}

/**
 * @param {string} pathSuffix
 * @param {RequestInit & { timeoutMs?: number }} [init]
 */
async function fetchJson(pathSuffix, init = {}) {
  const timeoutMs = init.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const { timeoutMs: _t, ...rest } = init
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const resp = await fetch(`${apiBase()}${pathSuffix}`, {
      ...rest,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(rest.headers ?? {}),
      },
    })
    const json = await resp.json().catch(() => ({}))
    if (!resp.ok) {
      const message = typeof json?.error === 'string' && json.error.trim()
        ? json.error.trim()
        : `HTTP ${resp.status}`
      throw new Error(message)
    }
    return json
  } finally {
    clearTimeout(timer)
  }
}

/** @param {unknown} [_repoRoot] */
async function getTranslationStatus(_repoRoot, _settingsOverride = null) {
  return fetchJson('/translation/status', { method: 'GET' })
}

/** @param {unknown} [_repoRoot] */
async function getTranslationModels(_repoRoot) {
  return fetchJson('/translation/models', { method: 'GET' })
}

/**
 * Open-folder UX only — resolves ~/.opptrix/llms (same as server downloadDirLabel `llms`).
 * Does not load models.
 */
async function ensureTranslationDownloadDir() {
  const dir = getDefaultDownloadDir()
  await fs.mkdir(dir, { recursive: true })
  return dir
}

/**
 * IPC：立即 ack；下载在服务端进行。进度由 renderer HTTP 轮询 status（不再经主进程推送）。
 * @param {unknown} [_repoRoot]
 * @param {string} modelId
 * @param {((progress: unknown) => void) | undefined} [_onProgress]
 */
async function startTranslationModelDownload(_repoRoot, modelId, _onProgress) {
  return fetchJson('/translation/download', {
    method: 'POST',
    body: JSON.stringify({ modelId: String(modelId ?? '') }),
  })
}

async function cancelTranslationModelDownload() {
  const json = await fetchJson('/translation/download/cancel', { method: 'POST', body: '{}' })
  return Boolean(json?.cancelled)
}

/**
 * Prefer SSE (`Accept: text/event-stream`) so IPC can forward segment progress.
 * Falls back to JSON if the stream path is unavailable.
 * @param {unknown} [_repoRoot]
 * @param {unknown} payload
 * @param {((progress: unknown) => void) | undefined} [onProgress]
 */
async function translateArticle(_repoRoot, payload, onProgress) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TRANSLATE_TIMEOUT_MS)
  try {
    const resp = await fetch(`${apiBase()}/translate?stream=1`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
      },
      body: JSON.stringify(payload ?? {}),
    })

    if (!resp.ok) {
      const json = await resp.json().catch(() => ({}))
      const message = typeof json?.error === 'string' && json.error.trim()
        ? json.error.trim()
        : `HTTP ${resp.status}`
      throw new Error(message)
    }

    const contentType = resp.headers.get('content-type') ?? ''
    if (contentType.includes('text/event-stream') && resp.body) {
      const reader = resp.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      /** @type {unknown} */
      let result = null
      /** @type {string | null} */
      let streamError = null

      /**
       * @param {string} block
       */
      const consumeBlock = (block) => {
        const lines = block.split('\n')
        let eventName = 'message'
        const dataLines = []
        for (const line of lines) {
          if (line.startsWith('event:')) eventName = line.slice(6).trim()
          else if (line.startsWith('data:')) dataLines.push(line.slice(5).trimStart())
        }
        if (!dataLines.length) return
        let parsed
        try {
          parsed = JSON.parse(dataLines.join('\n'))
        } catch {
          return
        }
        if (eventName === 'progress' && typeof onProgress === 'function') {
          onProgress(parsed)
        } else if (eventName === 'result') {
          result = parsed
        } else if (eventName === 'error') {
          streamError = typeof parsed?.error === 'string' ? parsed.error : '翻译失败，请稍后再试'
        }
      }

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const chunks = buffer.split('\n\n')
        buffer = chunks.pop() ?? ''
        for (const chunk of chunks) {
          if (chunk.trim()) consumeBlock(chunk)
        }
      }
      if (buffer.trim()) consumeBlock(buffer)

      if (streamError) throw new Error(streamError)
      if (result) return result
      throw new Error('翻译流式响应未返回结果')
    }

    return await resp.json()
  } catch (err) {
    if (typeof onProgress !== 'function') throw err
    // Progress was requested but SSE failed — try plain JSON once
    try {
      return await fetchJson('/translate', {
        method: 'POST',
        body: JSON.stringify(payload ?? {}),
        timeoutMs: TRANSLATE_TIMEOUT_MS,
      })
    } catch {
      throw err
    }
  } finally {
    clearTimeout(timer)
  }
}

/** Server bootstraps on settings PUT — Electron must not download/load GGUF. */
async function maybeBootstrapOfflineModelDownloads(_repoRoot, _onProgress) {
  return null
}

/** No in-process llama handles to free. */
async function disposeTranslation() {
  /* no-op */
}

/** @deprecated no local preload; kept so accidental callers do not load GGUF */
async function preloadTranslationModel(_repoRoot) {
  return null
}

function getDownloadState() {
  return null
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
}
