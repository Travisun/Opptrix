import fs from 'node:fs'
import path from 'node:path'
import { finished } from 'node:stream/promises'
import type { DownloadProgress } from '../types.js'
import { getCatalogModel } from './models.js'
import { ensureDirAsync, getLlmsDir } from '../paths.js'

const DOWNLOAD_USER_AGENT = 'Opptrix-Desktop/1.0'

let activeAbort: AbortController | null = null
let activeDownload: DownloadProgress | null = null

export function getDownloadState(): DownloadProgress | null {
  return activeDownload ? { ...activeDownload } : null
}

export function isDownloadActive(): boolean {
  return Boolean(activeDownload && activeDownload.status === 'downloading')
}

async function fetchModelStream(url: string, signal?: AbortSignal): Promise<Response> {
  const resp = await fetch(url, {
    signal,
    redirect: 'follow',
    headers: { 'User-Agent': DOWNLOAD_USER_AGENT },
  })
  if (!resp.ok || !resp.body) {
    throw new Error(`HTTP ${resp.status}`)
  }
  return resp
}

async function downloadFromSource(
  model: NonNullable<ReturnType<typeof getCatalogModel>>,
  source: { source: string; label: string; url: string },
  onProgress?: (p: DownloadProgress) => void,
): Promise<{ filePath: string; filename: string; source: string }> {
  const dir = getLlmsDir()
  await ensureDirAsync(dir)
  const targetPath = path.join(dir, model.filename)
  const tempPath = `${targetPath}.download`

  activeDownload = {
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
  const reader = resp.body!.getReader()
  let receivedBytes = 0

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (!value) continue
      receivedBytes += value.byteLength
      if (!fileStream.write(Buffer.from(value))) {
        await new Promise<void>(resolve => fileStream.once('drain', resolve))
      }
      activeDownload.receivedBytes = receivedBytes
      onProgress?.({ ...activeDownload, filePath: targetPath })
    }
    fileStream.end()
    await finished(fileStream)
    await fs.promises.rename(tempPath, targetPath)
    return { filePath: targetPath, filename: model.filename, source: source.source }
  } catch (error) {
    fileStream.destroy()
    try { await fs.promises.unlink(tempPath) } catch { /* ignore */ }
    throw error
  }
}

export async function downloadCatalogModel(
  modelId: string,
  onProgress?: (p: DownloadProgress) => void,
): Promise<{ filePath: string; filename: string }> {
  if (isDownloadActive()) {
    throw new Error('已有模型正在下载，请稍后再试')
  }

  const model = getCatalogModel(modelId)
  if (!model) throw new Error('未找到该模型')

  const targetPath = path.join(getLlmsDir(), model.filename)
  if (fs.existsSync(targetPath)) {
    const done: DownloadProgress = {
      modelId,
      filename: model.filename,
      status: 'completed',
      receivedBytes: model.sizeBytes,
      totalBytes: model.sizeBytes,
      filePath: targetPath,
    }
    onProgress?.(done)
    return { filePath: targetPath, filename: model.filename }
  }

  activeAbort = new AbortController()
  activeDownload = {
    modelId,
    filename: model.filename,
    receivedBytes: 0,
    totalBytes: model.sizeBytes,
    status: 'downloading',
  }

  const errors: string[] = []
  try {
    for (const source of model.urls) {
      try {
        const result = await downloadFromSource(model, source, onProgress)
        activeDownload.status = 'completed'
        onProgress?.({
          ...activeDownload,
          filePath: result.filePath,
          source: source.source,
          sourceLabel: source.label,
        })
        return result
      } catch (error) {
        if (activeAbort?.signal.aborted) throw error
        errors.push(`${source.label}: ${error instanceof Error ? error.message : String(error)}`)
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
  }
}

export function cancelModelDownload(): boolean {
  activeAbort?.abort()
  activeAbort = null
  activeDownload = null
  return true
}

export async function bootstrapModels(
  modelIds: readonly string[],
  onProgress?: (p: DownloadProgress) => void,
): Promise<void> {
  const { listInstalledGgufModels } = await import('./installed.js')
  const { isCatalogModelInstalled } = await import('./installed.js')
  const installedNames = new Set(listInstalledGgufModels().map(i => i.filename))

  for (const modelId of modelIds) {
    const model = getCatalogModel(modelId)
    if (!model || isCatalogModelInstalled(model, installedNames)) continue
    try {
      const result = await downloadCatalogModel(modelId, onProgress)
      installedNames.add(result.filename)
    } catch {
      // 单个失败不阻断
    }
  }
}
