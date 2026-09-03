/**
 * Download runtime .bin + .sha256 with adaptive mirror failover.
 *
 * check-update / releases JSON: always prefer AUTHORITATIVE (update.opptrix.org),
 * then failover to CN CDN (same JSON mirrored). Manifest package URLs stay on org;
 * CN downloads silently rewrite the host via rewriteCdnBase.
 *
 * Package order: CN → evzs → org → github; foreign → org CDN → github.
 * Gitee is never used as a runtime download source.
 */
import fs from 'node:fs'
import path from 'node:path'
import {
  resolveUpdateMirrorProfile,
  type UpdateMirrorProfile,
} from './download-mirror-profile.js'

/** Authoritative check-update / publish target. */
export const AUTHORITATIVE_UPDATE_CDN_BASE = 'https://update.opptrix.org'

/**
 * CN package CDN bases for silent host rewrite (first = preferred download).
 * Not used as the primary check-update order — see resolveCheckUpdateCdnBases.
 */
export const CN_UPDATE_CDN_BASES = [
  'https://update.opptrix.evzs.com',
  AUTHORITATIVE_UPDATE_CDN_BASE,
] as const

export type RuntimeDownloadSource = 'cdn_cn' | 'cdn' | 'github'

/**
 * CDN bases to try for check-update / releases list.
 * Always authoritative org first; then configured override; then CN mirror failover.
 */
export function resolveCheckUpdateCdnBases(opts?: {
  configuredBase?: string
}): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  const push = (raw: string): void => {
    const base = normalizeCdnBase(raw)
    if (seen.has(base)) return
    seen.add(base)
    out.push(base)
  }
  push(AUTHORITATIVE_UPDATE_CDN_BASE)
  if (opts?.configuredBase) push(opts.configuredBase)
  for (const base of CN_UPDATE_CDN_BASES) {
    push(base)
  }
  return out
}

export interface RuntimePackageMirrors {
  github?: { bin?: string; sha256?: string }
  /** Present on older manifests only — ignored at download time. */
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

function normalizeCdnBase(base: string): string {
  return base.trim().replace(/\/+$/, '') || AUTHORITATIVE_UPDATE_CDN_BASE
}

/** Same path/query/hash under a different CDN host. */
export function rewriteCdnBase(url: string, newBase: string): string {
  const base = normalizeCdnBase(newBase)
  try {
    const parsed = new URL(url)
    const next = new URL(base)
    return `${next.origin}${parsed.pathname}${parsed.search}${parsed.hash}`
  } catch {
    return url
  }
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
    const key = `${b}:${s}`
    if (seen.has(key)) return
    seen.add(key)
    out.push({ binUrl: b, sha256Url: s, source })
  }

  const mirrors = refs.mirrors ?? {}

  if (profile === 'cn') {
    for (let i = 0; i < CN_UPDATE_CDN_BASES.length; i++) {
      const base = CN_UPDATE_CDN_BASES[i]
      const source: RuntimeDownloadSource = i === 0 ? 'cdn_cn' : 'cdn'
      push(source, rewriteCdnBase(cdnBin, base), rewriteCdnBase(cdnSha, base))
    }
    push('github', mirrors.github?.bin, mirrors.github?.sha256)
  } else {
    push('cdn', cdnBin, cdnSha)
    push('github', mirrors.github?.bin, mirrors.github?.sha256)
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
