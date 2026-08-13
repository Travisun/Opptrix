const fs = require('node:fs')
const path = require('node:path')
const { finished } = require('node:stream/promises')
const { getCatalogModel, getDefaultDownloadDir } = require('./translation-model-catalog.cjs')

const DOWNLOAD_USER_AGENT = 'Opptrix-Desktop/1.0'

/** @type {AbortController | null} */
let activeAbort = null
/** @type {{ modelId: string; filename: string; receivedBytes: number; totalBytes: number; status: string; source?: string; sourceLabel?: string; error?: string } | null} */
let activeDownload = null
/** @type {Promise<{ filePath: string; filename: string; source?: string } | null> | null} */
let activeDownloadPromise = null

function getDownloadState() {
  if (!activeDownload) return null
  return { ...activeDownload }
}

function isDownloadActive() {
  return Boolean(activeDownload && activeDownload.status === 'downloading')
}

async function ensureDownloadDir() {
  const dir = getDefaultDownloadDir()
  await fs.promises.mkdir(dir, { recursive: true })
  return dir
}

async function fetchModelStream(url, signal) {
  const resp = await fetch(url, {
    signal,
    redirect: 'follow',
    headers: {
      'User-Agent': DOWNLOAD_USER_AGENT,
    },
  })
  if (!resp.ok || !resp.body) {
    throw new Error(`HTTP ${resp.status}`)
  }
  return resp
}

async function downloadFromSource(model, source, onProgress) {
  const dir = await ensureDownloadDir()
  const targetPath = path.join(dir, model.filename)
  const tempPath = `${targetPath}.download`

  activeDownload = {
    ...activeDownload,
    modelId: model.id,
    filename: model.filename,
    receivedBytes: 0,
    totalBytes: model.sizeBytes,
    status: 'downloading',
    source: source.source,
    sourceLabel: source.label,
  }
  onProgress?.({ ...activeDownload, filePath: targetPath })

  const resp = await fetchModelStream(source.url, activeAbort?.signal)
  const totalBytes = Number(resp.headers.get('content-length') ?? model.sizeBytes) || model.sizeBytes
  activeDownload.totalBytes = totalBytes

  const fileStream = fs.createWriteStream(tempPath, { flags: 'w' })
  const reader = resp.body.getReader()
  let receivedBytes = 0

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (!value) continue
      receivedBytes += value.byteLength
      if (!fileStream.write(Buffer.from(value))) {
        await new Promise(resolve => fileStream.once('drain', resolve))
      }
      activeDownload.receivedBytes = receivedBytes
      activeDownload.totalBytes = totalBytes
      onProgress?.({ ...activeDownload, filePath: targetPath })
    }

    fileStream.end()
    await finished(fileStream)

    await fs.promises.rename(tempPath, targetPath)
    return { filePath: targetPath, filename: model.filename, source: source.source }
  } catch (error) {
    fileStream.destroy()
    try {
      await fs.promises.unlink(tempPath)
    } catch { /* ignore */ }
    throw error
  }
}

/**
 * 同步占位后跑下载任务；finally 清理 slot。
 * @param {NonNullable<ReturnType<typeof getCatalogModel>>} model
 * @param {string} targetPath
 * @param {(p: object) => void} [onProgress]
 */
async function runDownloadJob(model, targetPath, onProgress) {
  const errors = []
  try {
    for (const source of model.urls) {
      try {
        const result = await downloadFromSource(model, source, onProgress)
        if (activeDownload) {
          activeDownload.status = 'completed'
          onProgress?.({
            ...activeDownload,
            filePath: result.filePath,
            source: source.source,
            sourceLabel: source.label,
          })
        }
        return result
      } catch (error) {
        if (activeAbort?.signal.aborted) throw error
        const message = error instanceof Error ? error.message : String(error)
        errors.push(`${source.label}: ${message}`)
      }
    }

    throw new Error(errors.join('；') || '所有下载源均失败')
  } catch (error) {
    if (activeDownload) {
      activeDownload.status = 'error'
      onProgress?.({
        ...activeDownload,
        error: error instanceof Error ? error.message : String(error),
        filePath: targetPath,
      })
    }
    throw error
  } finally {
    activeAbort = null
    activeDownload = null
    activeDownloadPromise = null
  }
}

/**
 * 同步认领下载槽；已在下载则返回 null（调用方决定 throw 或 ack started:false）。
 * @returns {{ model: NonNullable<ReturnType<typeof getCatalogModel>>; targetPath: string; alreadyPresent: boolean } | null}
 */
function tryClaimDownload(modelId) {
  // 含 downloading→error/completed 到 finally 清槽的短暂窗口，避免双开
  if (activeDownload || activeDownloadPromise) return null

  const model = getCatalogModel(modelId)
  if (!model) throw new Error('未找到该离线翻译模型')

  const targetPath = path.join(getDefaultDownloadDir(), model.filename)
  if (fs.existsSync(targetPath)) {
    return { model, targetPath, alreadyPresent: true }
  }

  activeAbort = new AbortController()
  activeDownload = {
    modelId,
    filename: model.filename,
    receivedBytes: 0,
    totalBytes: model.sizeBytes,
    status: 'downloading',
  }
  return { model, targetPath, alreadyPresent: false }
}

/**
 * 阻塞至下载完成（bootstrap / 测试）。并发时抛错。
 * @param {string} modelId
 * @param {(p: object) => void} [onProgress]
 */
async function downloadTranslationModel(modelId, onProgress) {
  const claim = tryClaimDownload(modelId)
  if (!claim) {
    throw new Error('已有模型正在下载，请稍后再试')
  }

  const { model, targetPath, alreadyPresent } = claim
  if (alreadyPresent) {
    onProgress?.({
      modelId,
      filename: model.filename,
      status: 'completed',
      receivedBytes: model.sizeBytes,
      totalBytes: model.sizeBytes,
      filePath: targetPath,
    })
    return { filePath: targetPath, filename: model.filename }
  }

  const job = runDownloadJob(model, targetPath, onProgress)
  activeDownloadPromise = job.catch(() => null)
  return job
}

/**
 * IPC 用：立即 ack，后台继续下载。并发不双开（started:false + 当前 state）。
 * @param {string} modelId
 * @param {(p: object) => void} [onProgress]
 * @returns {{ started: boolean; download: ReturnType<typeof getDownloadState>; alreadyPresent?: boolean }}
 */
function startTranslationModelDownloadAck(modelId, onProgress) {
  if (activeDownload || activeDownloadPromise) {
    return { started: false, download: getDownloadState() }
  }

  const claim = tryClaimDownload(modelId)
  if (!claim) {
    return { started: false, download: getDownloadState() }
  }

  const { model, targetPath, alreadyPresent } = claim
  if (alreadyPresent) {
    const download = {
      modelId,
      filename: model.filename,
      status: 'completed',
      receivedBytes: model.sizeBytes,
      totalBytes: model.sizeBytes,
      filePath: targetPath,
    }
    onProgress?.(download)
    return { started: true, download, alreadyPresent: true }
  }

  const job = runDownloadJob(model, targetPath, onProgress)
  activeDownloadPromise = job.catch(() => null)
  // 后台继续；错误已通过 onProgress(status=error) 上报
  void job.catch(() => {})

  return { started: true, download: getDownloadState() }
}

function cancelTranslationModelDownload() {
  if (activeAbort) {
    activeAbort.abort()
  }
  activeDownload = null
  activeAbort = null
  return true
}

/** @internal */
function __resetDownloadStateForTests() {
  if (activeAbort) {
    try { activeAbort.abort() } catch { /* ignore */ }
  }
  activeAbort = null
  activeDownload = null
  activeDownloadPromise = null
}

/** @internal */
function __getActiveDownloadPromiseForTests() {
  return activeDownloadPromise
}

module.exports = {
  downloadTranslationModel,
  startTranslationModelDownloadAck,
  cancelTranslationModelDownload,
  getDownloadState,
  isDownloadActive,
  __resetDownloadStateForTests,
  __getActiveDownloadPromiseForTests,
}
