/**
 * multilingual-e5-small：桌面安装包可内置；否则按需下载到用户目录。
 * 查找顺序：bundled → llms 开发路径 → ~/.opptrix/llms/… → 旧 ~/.opptrix/models/…；
 * 下载源 ModelScope → HF 镜像 → Hugging Face。
 * 日志不打印 URL token / Authorization。
 */
import fs from 'node:fs'
import path from 'node:path'
import { finished } from 'node:stream/promises'
import {
  embeddingModelDir,
  EMBEDDING_MODEL_ID,
  getBundledEmbeddingModelDir,
  listEmbeddingModelSearchDirs,
  type EmbeddingModelSource,
} from './paths.js'

const DOWNLOAD_USER_AGENT = 'Opptrix-Desktop/1.0'
const DEFAULT_TIMEOUT_MS = 120_000

/** Xenova 兼容布局（transformers.js / ONNX） */
export const E5_MODEL_FILES = [
  'config.json',
  'tokenizer.json',
  'tokenizer_config.json',
  'special_tokens_map.json',
  'onnx/model_quantized.onnx',
] as const

const OPTIONAL_FILES = new Set<string>(['special_tokens_map.json'])

const MODELSCOPE_REPO = String(
  process.env.OPPTRIX_E5_MODELSCOPE_REPO ?? 'Xenova/multilingual-e5-small',
).replace(/^\/+|\/+$/g, '')
const HF_REPO = String(
  process.env.OPPTRIX_E5_HF_REPO ?? 'Xenova/multilingual-e5-small',
).replace(/^\/+|\/+$/g, '')

function modelscopeBase(): string {
  return String(process.env.OPPTRIX_MODELSCOPE_BASE ?? 'https://modelscope.cn').replace(/\/$/, '')
}

function hfMirrorBase(): string {
  return String(process.env.OPPTRIX_HF_MIRROR ?? 'https://hf-mirror.com').replace(/\/$/, '')
}

function buildModelScopeUrl(filename: string): string {
  return `${modelscopeBase()}/models/${MODELSCOPE_REPO}/resolve/master/${filename}`
}

function buildHfUrl(base: string, filename: string): string {
  return `${base}/${HF_REPO}/resolve/main/${filename}?download=true`
}

export type DownloadProgress = {
  file: string
  receivedBytes: number
  totalBytes: number | null
  sourceLabel: string
}

export type EmbeddingModelStatus = {
  installed: boolean
  modelId: string
  dir: string
  missingFiles: string[]
  source: EmbeddingModelSource
}

function looksLikeHtmlBody(head: Uint8Array): boolean {
  const prefix = Buffer.from(head).toString('utf8', 0, Math.min(head.length, 256)).trimStart().toLowerCase()
  return prefix.startsWith('<!doctype') || prefix.startsWith('<html')
}

function sourcesFor(filename: string): Array<{ label: string; url: string }> {
  return [
    { label: 'modelscope', url: buildModelScopeUrl(filename) },
    { label: 'hf-mirror', url: buildHfUrl(hfMirrorBase(), filename) },
    { label: 'huggingface', url: buildHfUrl('https://huggingface.co', filename) },
  ]
}

function missingRequiredFiles(modelDir: string): string[] {
  const missingFiles: string[] = []
  for (const file of E5_MODEL_FILES) {
    if (OPTIONAL_FILES.has(file)) continue
    if (!fs.existsSync(path.join(modelDir, file))) missingFiles.push(file)
  }
  return missingFiles
}

function sourceForDir(modelDir: string, repoRoot?: string): EmbeddingModelSource {
  const bundled = getBundledEmbeddingModelDir(repoRoot)
  if (bundled && path.resolve(modelDir) === path.resolve(bundled)) return 'bundled'
  if (path.resolve(modelDir) === path.resolve(embeddingModelDir())) return 'user'
  return 'user'
}

/** 在搜索目录中解析首个已就绪目录；都未就绪时回落用户目录。 */
export function resolveEmbeddingModelDir(repoRoot?: string): {
  dir: string
  source: EmbeddingModelSource
  missingFiles: string[]
} {
  for (const dir of listEmbeddingModelSearchDirs(repoRoot)) {
    const missing = missingRequiredFiles(dir)
    if (missing.length === 0) {
      return { dir, source: sourceForDir(dir, repoRoot), missingFiles: [] }
    }
  }
  const userDir = embeddingModelDir()
  return {
    dir: userDir,
    source: 'missing',
    missingFiles: missingRequiredFiles(userDir),
  }
}

export function getEmbeddingModelStatus(modelDir?: string): EmbeddingModelStatus {
  if (modelDir !== undefined) {
    const missingFiles = missingRequiredFiles(modelDir)
    return {
      installed: missingFiles.length === 0,
      modelId: EMBEDDING_MODEL_ID,
      dir: modelDir,
      missingFiles,
      source: missingFiles.length === 0 ? sourceForDir(modelDir) : 'missing',
    }
  }

  const resolved = resolveEmbeddingModelDir()
  return {
    installed: resolved.source !== 'missing',
    modelId: EMBEDDING_MODEL_ID,
    dir: resolved.dir,
    missingFiles: resolved.missingFiles,
    source: resolved.source,
  }
}

export function isEmbeddingModelInstalled(modelDir?: string): boolean {
  return getEmbeddingModelStatus(modelDir).installed
}

export function verifyEmbeddingModel(
  modelDir?: string,
): { ok: true } | { ok: false; missingFiles: string[] } {
  const status = getEmbeddingModelStatus(modelDir)
  if (status.installed) return { ok: true }
  return { ok: false, missingFiles: status.missingFiles }
}

async function downloadToFile(
  url: string,
  destPath: string,
  opts: {
    timeoutMs: number
    onProgress?: (received: number, total: number | null) => void
  },
): Promise<void> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs)
  try {
    const resp = await fetch(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: { 'User-Agent': DOWNLOAD_USER_AGENT },
    })
    if (!resp.ok || !resp.body) {
      throw new Error(`HTTP ${resp.status}`)
    }

    const contentType = resp.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() ?? ''
    if (contentType === 'text/html' || contentType === 'application/xhtml+xml') {
      throw new Error('invalid content type')
    }

    const totalHeader = resp.headers.get('content-length')
    const totalBytes = totalHeader ? Number(totalHeader) : null
    const safeTotal = totalBytes !== null && Number.isFinite(totalBytes) && totalBytes > 0
      ? totalBytes
      : null

    await fs.promises.mkdir(path.dirname(destPath), { recursive: true })
    const fileStream = fs.createWriteStream(destPath, { flags: 'w' })
    const reader = resp.body.getReader()
    let received = 0
    let htmlChecked = false

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        if (!value) continue
        if (!htmlChecked) {
          if (looksLikeHtmlBody(value)) {
            throw new Error('invalid html body')
          }
          htmlChecked = true
        }
        received += value.byteLength
        opts.onProgress?.(received, safeTotal)
        if (!fileStream.write(Buffer.from(value))) {
          await new Promise<void>((resolve) => {
            fileStream.once('drain', resolve)
          })
        }
      }
      fileStream.end()
      await finished(fileStream)
    } catch (err) {
      fileStream.destroy()
      throw err
    }
  } finally {
    clearTimeout(timer)
  }
}

async function downloadFileFromSources(
  filename: string,
  targetPath: string,
  opts: {
    timeoutMs: number
    onProgress?: (p: DownloadProgress) => void
  },
): Promise<void> {
  if (fs.existsSync(targetPath)) return

  const tempPath = `${targetPath}.download`
  const errors: string[] = []

  for (const source of sourcesFor(filename)) {
    try {
      await downloadToFile(source.url, tempPath, {
        timeoutMs: opts.timeoutMs,
        onProgress: (received, total) => {
          opts.onProgress?.({
            file: filename,
            receivedBytes: received,
            totalBytes: total,
            sourceLabel: source.label,
          })
        },
      })
      await fs.promises.rename(tempPath, targetPath)
      return
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      // 仅记录源标签与错误类型，不打印完整 URL（可能含 query token）
      errors.push(`${source.label}: ${message}`)
      try {
        await fs.promises.unlink(tempPath)
      } catch {
        /* ignore */
      }
    }
  }

  throw new Error(`无法下载语义检索模型文件 ${filename}（${errors.join('; ')}）`)
}

export async function downloadEmbeddingModel(opts: {
  modelDir?: string
  timeoutMs?: number
  onProgress?: (p: DownloadProgress) => void
} = {}): Promise<EmbeddingModelStatus> {
  // 下载始终写入用户目录；bundled 已就绪时直接返回
  if (!opts.modelDir && isEmbeddingModelInstalled()) {
    return getEmbeddingModelStatus()
  }
  const modelDir = opts.modelDir ?? embeddingModelDir()
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS
  await fs.promises.mkdir(modelDir, { recursive: true })

  for (const file of E5_MODEL_FILES) {
    const target = path.join(modelDir, file)
    if (fs.existsSync(target)) continue
    try {
      await downloadFileFromSources(file, target, {
        timeoutMs,
        onProgress: opts.onProgress,
      })
    } catch (err) {
      if (OPTIONAL_FILES.has(file)) continue
      throw err
    }
  }

  const verified = verifyEmbeddingModel(modelDir)
  if (!verified.ok) {
    throw new Error(`语义检索模型校验失败，缺少：${verified.missingFiles.join(', ')}`)
  }
  return getEmbeddingModelStatus(modelDir)
}

/** 仅删除用户目录副本；永不删除安装包内置文件。 */
export async function removeEmbeddingModel(modelDir = embeddingModelDir()): Promise<void> {
  const userDir = path.resolve(embeddingModelDir())
  const target = path.resolve(modelDir)
  if (target !== userDir) return
  if (!fs.existsSync(userDir)) return
  await fs.promises.rm(userDir, { recursive: true, force: true })
}
