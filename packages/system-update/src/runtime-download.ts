/**
 * Download runtime .bin + .sha256 with adaptive mirror failover.
 */
import fs from 'node:fs'
import path from 'node:path'
import {
  resolveUpdateMirrorProfile,
  type UpdateMirrorProfile,
} from './download-mirror-profile.js'

export type RuntimeDownloadSource = 'gitee' | 'github' | 'cdn'

export interface RuntimePackageMirrors {
  github?: { bin?: string; sha256?: string }
  gitee?: { bin?: string; sha256?: string }
}

export interface RuntimeDownloadRefs {
  binUrl: string
  sha256Url: string
  mirrors?: RuntimePackageMirrors
}

export interface DownloadFileOptions {
  headers?: Record<string, string>
  timeoutMs?: number
  signal?: AbortSignal
  onProgress?: (received: number, total: number | null) => void
}

function mirrorSourceOrder(profile: UpdateMirrorProfile): RuntimeDownloadSource[] {
  return profile === 'cn'
    ? ['gitee', 'github', 'cdn']
    : ['github', 'gitee', 'cdn']
}

export function buildRuntimeDownloadCandidates(
  refs: RuntimeDownloadRefs,
  profile: UpdateMirrorProfile,
): Array<{ binUrl: string; sha256Url: string; source: RuntimeDownloadSource }> {
  const cdnBin = refs.binUrl.trim()
  const cdnSha = refs.sha256Url.trim()
  if (!cdnBin || !cdnSha) {
    throw new Error('buildRuntimeDownloadCandidates: missing CDN refs')
  }

  const out: Array<{ binUrl: string; sha256Url: string; source: RuntimeDownloadSource }> = []
  const seen = new Set<string>()

  const push = (
    source: RuntimeDownloadSource,
    bin: string | undefined,
    sha: string | undefined,
  ): void => {
    const b = bin?.trim()
    const s = sha?.trim()
    if (!b || !s) return
    const key = `${source}:${b}:${s}`
    if (seen.has(key)) return
    seen.add(key)
    out.push({ binUrl: b, sha256Url: s, source })
  }

  const mirrors = refs.mirrors ?? {}
  for (const source of mirrorSourceOrder(profile)) {
    if (source === 'cdn') {
      push('cdn', cdnBin, cdnSha)
      continue
    }
    const block = mirrors[source]
    push(source, block?.bin, block?.sha256)
  }

  if (out.length === 0) {
    out.push({ binUrl: cdnBin, sha256Url: cdnSha, source: 'cdn' })
  }
  return out
}

export async function downloadToFile(
  url: string,
  destPath: string,
  opts: DownloadFileOptions = {},
): Promise<{ bytes: number }> {
  const ac = new AbortController()
  const onAbort = (): void => ac.abort()
  if (opts.signal) {
    if (opts.signal.aborted) ac.abort()
    else opts.signal.addEventListener('abort', onAbort, { once: true })
  }
  const timer = setTimeout(() => ac.abort(), opts.timeoutMs ?? 180_000)
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: opts.headers,
      signal: ac.signal,
      redirect: 'follow',
    })
    if (!res.ok || !res.body) {
      throw new Error(`download failed (${res.status})`)
    }
    const totalHeader = res.headers.get('content-length')
    const total =
      totalHeader && Number.isFinite(Number(totalHeader)) ? Number(totalHeader) : null
    const reader = res.body.getReader()
    const chunks: Buffer[] = []
    let received = 0
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      if (value) {
        const buf = Buffer.from(value)
        chunks.push(buf)
        received += buf.length
        opts.onProgress?.(received, total)
      }
    }
    fs.mkdirSync(path.dirname(destPath), { recursive: true })
    fs.writeFileSync(destPath, Buffer.concat(chunks))
    return { bytes: received }
  } finally {
    clearTimeout(timer)
    if (opts.signal) opts.signal.removeEventListener('abort', onAbort)
  }
}

export interface DownloadRuntimePairResult {
  source: RuntimeDownloadSource
  bytes: number
  tried: RuntimeDownloadSource[]
}

export async function downloadRuntimeAssetPair(
  refs: RuntimeDownloadRefs,
  opts: {
    binDest: string
    shaDest: string
    profile?: UpdateMirrorProfile
    env?: NodeJS.ProcessEnv
    headers?: Record<string, string>
    timeoutMs?: number
    shaTimeoutMs?: number
    signal?: AbortSignal
    onProgress?: (received: number, total: number | null) => void
    probeNetwork?: boolean
  },
): Promise<DownloadRuntimePairResult> {
  const profile = opts.profile
    ?? resolveUpdateMirrorProfile(opts.env, { probeNetwork: opts.probeNetwork }).profile
  const candidates = buildRuntimeDownloadCandidates(refs, profile)
  const tried: RuntimeDownloadSource[] = []
  let lastErr: unknown = null

  for (const candidate of candidates) {
    tried.push(candidate.source)
    try {
      const { bytes } = await downloadToFile(candidate.binUrl, opts.binDest, {
        headers: opts.headers,
        timeoutMs: opts.timeoutMs,
        signal: opts.signal,
        onProgress: opts.onProgress,
      })
      await downloadToFile(candidate.sha256Url, opts.shaDest, {
        headers: opts.headers,
        timeoutMs: opts.shaTimeoutMs ?? opts.timeoutMs ?? 60_000,
        signal: opts.signal,
      })
      return { source: candidate.source, bytes, tried }
    } catch (err) {
      lastErr = err
      try {
        if (fs.existsSync(opts.binDest)) fs.unlinkSync(opts.binDest)
        if (fs.existsSync(opts.shaDest)) fs.unlinkSync(opts.shaDest)
      } catch {
        // ignore cleanup errors
      }
    }
  }

  const message = lastErr instanceof Error ? lastErr.message : String(lastErr ?? 'download failed')
  throw new Error(`${message} (tried: ${tried.join(' → ')})`)
}

export { resolveUpdateMirrorProfile, type UpdateMirrorProfile }
