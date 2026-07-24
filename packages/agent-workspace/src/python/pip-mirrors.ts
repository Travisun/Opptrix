import fs from 'node:fs'
import fsPromises from 'node:fs/promises'
import path from 'node:path'
import { resolvePythonRuntimeRoot } from '@opptrix/shared'

const PROBE_TIMEOUT_MS = 2500
export const PIP_MIRROR_CACHE_TTL_MS = 90 * 24 * 60 * 60 * 1000
const CACHE_FILENAME = 'pip-mirrors-cache.json'

interface PipMirrorCacheEntry {
  urlsKey: string
  sortedUrls: string[]
  expiresAt: number
}

interface ProbeResult {
  url: string
  ok: boolean
  rttMs: number
}

let cache: PipMirrorCacheEntry | null = null
let diskHydrated = false
let inflightKey: string | null = null
let inflightPromise: Promise<string[]> | null = null

function getCacheFilePath(): string {
  return path.join(resolvePythonRuntimeRoot(), CACHE_FILENAME)
}

function urlsCacheKey(urls: readonly string[]): string {
  return urls.join('\0')
}

function normalizeProbeUrl(indexUrl: string): string {
  const trimmed = indexUrl.trim().replace(/\/+$/, '')
  return `${trimmed}/`
}

function isValidCacheEntry(value: unknown): value is PipMirrorCacheEntry {
  if (typeof value !== 'object' || value === null) return false
  const entry = value as Record<string, unknown>
  if (typeof entry.urlsKey !== 'string') return false
  if (!Array.isArray(entry.sortedUrls) || !entry.sortedUrls.every(item => typeof item === 'string')) {
    return false
  }
  if (typeof entry.expiresAt !== 'number' || !Number.isFinite(entry.expiresAt)) return false
  return true
}

function hydrateCacheFromDisk(): void {
  if (diskHydrated) return
  diskHydrated = true
  try {
    const filePath = getCacheFilePath()
    if (!fs.existsSync(filePath)) return
    const raw = fs.readFileSync(filePath, 'utf8')
    const parsed: unknown = JSON.parse(raw)
    if (!isValidCacheEntry(parsed)) return
    if (Date.now() >= parsed.expiresAt) return
    cache = {
      urlsKey: parsed.urlsKey,
      sortedUrls: [...parsed.sortedUrls],
      expiresAt: parsed.expiresAt,
    }
  } catch {
    // 读写失败静默回退内存/重测
  }
}

function persistCacheToDisk(entry: PipMirrorCacheEntry): void {
  try {
    const dir = resolvePythonRuntimeRoot()
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(getCacheFilePath(), JSON.stringify(entry), 'utf8')
  } catch {
    // 读写失败静默回退内存/重测
  }
}

function removeCacheFile(): void {
  try {
    fs.unlinkSync(getCacheFilePath())
  } catch {
    // 文件不存在或删除失败时忽略
  }
}

function readCachedSorted(urls: readonly string[]): string[] | null {
  hydrateCacheFromDisk()
  if (!cache) return null
  if (cache.urlsKey !== urlsCacheKey(urls)) return null
  if (Date.now() >= cache.expiresAt) return null
  return cache.sortedUrls
}

function writeCache(urls: readonly string[], sortedUrls: string[]): void {
  cache = {
    urlsKey: urlsCacheKey(urls),
    sortedUrls: [...sortedUrls],
    expiresAt: Date.now() + PIP_MIRROR_CACHE_TTL_MS,
  }
  persistCacheToDisk(cache)
}

/** 清除 pip 镜像测速缓存；网络失败时调用以触发重测或轮换。 */
export function invalidatePipMirrorCache(): void {
  cache = null
  diskHydrated = true
  removeCacheFile()
  inflightKey = null
  inflightPromise = null
}

/** 将当前首选镜像移到末尾并写回缓存；用于镜像失败后的有限轮换。 */
export function rotatePreferredPipMirror(urls: readonly string[]): void {
  if (urls.length <= 1) return
  hydrateCacheFromDisk()
  const key = urlsCacheKey(urls)
  let rotated: string[]
  if (cache && cache.urlsKey === key && cache.sortedUrls.length > 1) {
    rotated = [...cache.sortedUrls.slice(1), cache.sortedUrls[0]]
  } else {
    rotated = [...urls.slice(1), urls[0]]
  }
  writeCache(urls, rotated)
}

async function probeOneUrl(url: string): Promise<ProbeResult> {
  const probeUrl = normalizeProbeUrl(url)
  const started = performance.now()
  try {
    let resp = await fetch(probeUrl, {
      method: 'HEAD',
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
      redirect: 'follow',
    })
    if (!resp.ok && (resp.status === 405 || resp.status === 501)) {
      resp = await fetch(probeUrl, {
        method: 'GET',
        signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
        redirect: 'follow',
      })
    }
    const rttMs = performance.now() - started
    return { url, ok: resp.ok, rttMs }
  } catch {
    return { url, ok: false, rttMs: Number.POSITIVE_INFINITY }
  }
}

/** 并行探测 pip 镜像可达性与 RTT，成功的按延迟升序，失败排在后面。 */
export async function probePipIndexUrls(urls: readonly string[]): Promise<string[]> {
  if (urls.length === 0) return []
  if (urls.length === 1) return [urls[0]]

  const results = await Promise.all(urls.map(probeOneUrl))
  const ok = results
    .filter(result => result.ok)
    .sort((a, b) => a.rttMs - b.rttMs)
    .map(result => result.url)
  const failed = results
    .filter(result => !result.ok)
    .map(result => result.url)

  if (ok.length === 0) {
    return [...urls]
  }
  return [...ok, ...failed]
}

async function resolveSortedPipIndexUrls(urls: readonly string[]): Promise<string[]> {
  const cached = readCachedSorted(urls)
  if (cached) return cached

  const key = urlsCacheKey(urls)
  if (inflightPromise && inflightKey === key) {
    return inflightPromise
  }

  inflightKey = key
  inflightPromise = probePipIndexUrls(urls).then(sorted => {
    writeCache(urls, sorted)
    return sorted
  })

  try {
    return await inflightPromise
  } finally {
    if (inflightKey === key) {
      inflightKey = null
      inflightPromise = null
    }
  }
}

/** 带 TTL 缓存，返回最快可用 pip 镜像；空列表返回 undefined。 */
export async function resolvePreferredPipIndexUrl(
  urls: readonly string[],
): Promise<string | undefined> {
  if (urls.length === 0) return undefined
  const sorted = await resolveSortedPipIndexUrls(urls)
  return sorted[0]
}

/** 同步读取缓存中的最快源；未命中时回退到列表首项。 */
export function getPreferredPipIndexUrlSync(urls: readonly string[]): string | undefined {
  if (urls.length === 0) return undefined
  const cached = readCachedSorted(urls)
  if (cached && cached.length > 0) return cached[0]
  return urls[0]
}

/** 同步读取缓存中的排序列表；未命中时返回原列表。 */
export function getSortedPipIndexUrlsSync(urls: readonly string[]): readonly string[] {
  const cached = readCachedSorted(urls)
  if (cached) return cached
  return urls
}

/** 判断 pip / get-pip 失败是否可能由镜像或网络问题引起。 */
export function isPipMirrorNetworkFailure(message: string): boolean {
  const text = message.toLowerCase()
  return /timeout|timed out|time-out|econnrefused|enotfound|etimedout|connection (?:error|refused|reset|aborted)|could not find a version|max retries|read timed out|failed to establish|temporary failure|name or service not known|network is unreachable|no route to host|ssl:|certificate verify failed|index-url|index url|simple\//.test(text)
}

export function resetPipMirrorCacheForTests(): void {
  cache = null
  diskHydrated = false
  inflightKey = null
  inflightPromise = null
  removeCacheFile()
}

/** 测试用：读取磁盘缓存文件内容（不存在时返回 null）。 */
export async function readPipMirrorCacheFileForTests(): Promise<PipMirrorCacheEntry | null> {
  try {
    const raw = await fsPromises.readFile(getCacheFilePath(), 'utf8')
    const parsed: unknown = JSON.parse(raw)
    if (!isValidCacheEntry(parsed)) return null
    return {
      urlsKey: parsed.urlsKey,
      sortedUrls: [...parsed.sortedUrls],
      expiresAt: parsed.expiresAt,
    }
  } catch {
    return null
  }
}
