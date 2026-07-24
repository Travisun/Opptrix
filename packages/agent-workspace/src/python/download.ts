import { createHash } from 'node:crypto'
import dns from 'node:dns'
import fs from 'node:fs'
import fsPromises from 'node:fs/promises'
import path from 'node:path'
import type { PythonPlatformArtifact } from './catalog.js'

export interface PythonDownloadProgress {
  url: string
  bytesDownloaded: number
  bytesTotal: number | null
}

export interface PythonDownloadResult {
  destPath: string
  bytesDownloaded: number
  sha256: string
  sourceUrl: string
}

const DEFAULT_TIMEOUT_MS = 20 * 60 * 1000
const USER_AGENT = 'Opptrix-Desktop/1.0'

try {
  dns.setDefaultResultOrder('ipv4first')
} catch {
  // unsupported on some runtimes
}

function isHtmlContentType(contentType: string | null): boolean {
  if (!contentType) return false
  const normalized = contentType.split(';')[0]?.trim().toLowerCase() ?? ''
  return normalized === 'text/html' || normalized === 'application/xhtml+xml'
}

function looksLikeHtmlBody(head: Uint8Array): boolean {
  const prefix = Buffer.from(head).toString('utf8', 0, Math.min(head.length, 256)).trimStart().toLowerCase()
  return prefix.startsWith('<!doctype') || prefix.startsWith('<html')
}

async function verifySha256(filePath: string, expected: string): Promise<void> {
  const hash = createHash('sha256')
  await new Promise<void>((resolve, reject) => {
    const stream = fs.createReadStream(filePath)
    stream.on('data', chunk => hash.update(chunk))
    stream.on('error', reject)
    stream.on('end', () => resolve())
  })
  const actual = hash.digest('hex')
  if (actual.toLowerCase() !== expected.toLowerCase()) {
    throw new Error('安装包校验失败，请稍后重试')
  }
}

async function downloadOnce(
  url: string,
  destPath: string,
  onProgress?: (progress: PythonDownloadProgress) => void,
  signal?: AbortSignal,
): Promise<{ bytes: number; sha256: string }> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS)
  const onAbort = () => controller.abort()
  signal?.addEventListener('abort', onAbort, { once: true })

  let resp: Response
  try {
    resp = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: { 'User-Agent': USER_AGENT },
    })
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', onAbort)
  }
  if (!resp.ok) {
    throw new Error(`下载失败（HTTP ${resp.status}）`)
  }
  if (isHtmlContentType(resp.headers.get('content-type'))) {
    throw new Error('下载源返回了无效页面，请稍后重试')
  }

  const totalHeader = resp.headers.get('content-length')
  const bytesTotal = totalHeader ? Number(totalHeader) : null
  await fsPromises.mkdir(path.dirname(destPath), { recursive: true })

  const tmpPath = `${destPath}.part`
  await fsPromises.unlink(tmpPath).catch(() => {})

  const hash = createHash('sha256')
  const reader = resp.body?.getReader()
  if (!reader) {
    const buf = Buffer.from(await resp.arrayBuffer())
    if (looksLikeHtmlBody(buf)) {
      throw new Error('下载源返回了无效页面，请稍后重试')
    }
    hash.update(buf)
    await fsPromises.writeFile(tmpPath, buf)
    await fsPromises.rename(tmpPath, destPath)
    onProgress?.({ url, bytesDownloaded: buf.length, bytesTotal: buf.length })
    return { bytes: buf.length, sha256: hash.digest('hex') }
  }

  const fd = await fsPromises.open(tmpPath, 'w')
  let bytesDownloaded = 0
  let htmlChecked = false
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (!htmlChecked) {
        if (looksLikeHtmlBody(value)) {
          throw new Error('下载源返回了无效页面，请稍后重试')
        }
        htmlChecked = true
      }
      hash.update(value)
      await fd.write(value)
      bytesDownloaded += value.length
      onProgress?.({ url, bytesDownloaded, bytesTotal })
    }
  } finally {
    await fd.close()
  }

  await fsPromises.rename(tmpPath, destPath)
  return { bytes: bytesDownloaded, sha256: hash.digest('hex') }
}

export async function downloadPythonArtifact(
  artifact: PythonPlatformArtifact,
  destPath: string,
  opts?: {
    onProgress?: (progress: PythonDownloadProgress) => void
    signal?: AbortSignal
  },
): Promise<PythonDownloadResult> {
  const errors: string[] = []

  for (const url of artifact.urls) {
    try {
      const { bytes, sha256 } = await downloadOnce(url, destPath, opts?.onProgress, opts?.signal)
      if (artifact.sha256) {
        await verifySha256(destPath, artifact.sha256)
      } else if (artifact.expectedSizeBytes != null && bytes !== artifact.expectedSizeBytes) {
        throw new Error('安装包大小异常，请稍后重试')
      }
      return {
        destPath,
        bytesDownloaded: bytes,
        sha256,
        sourceUrl: url,
      }
    } catch (err) {
      await fsPromises.unlink(destPath).catch(() => {})
      await fsPromises.unlink(`${destPath}.part`).catch(() => {})
      errors.push(err instanceof Error ? err.message : String(err))
    }
  }

  const detail = errors.length > 0 ? errors.join('；') : '未知错误'
  throw new Error(`所有下载源均失败：${detail}`)
}

export async function verifyFileSha256(filePath: string, expected: string): Promise<void> {
  await verifySha256(filePath, expected)
}
