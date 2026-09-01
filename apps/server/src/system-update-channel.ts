/**
 * CDN hot-update channel for selfhost runtime packages.
 * Default base: https://update.opptrix.org
 */
export const DEFAULT_UPDATE_CDN_BASE = 'https://update.opptrix.org'

export const SELFHOST_TAG_PREFIX = 'opptrix-selfhost-v'

export interface ChannelEnv {
  cdnBase: string
  channel: string
}

export interface HotLatestRelease {
  version: string
  binUrl: string
  sha256Url: string
  binName: string
  sha256Name: string
  size: number | null
  publishedAt: string | null
}

export function readChannelEnv(): ChannelEnv {
  const raw = (process.env.OPPTRIX_UPDATE_CDN_BASE ?? DEFAULT_UPDATE_CDN_BASE).trim()
  const cdnBase = raw.replace(/\/+$/, '') || DEFAULT_UPDATE_CDN_BASE
  return {
    cdnBase,
    channel: (process.env.OPPTRIX_UPDATE_CHANNEL ?? 'selfhost').trim() || 'selfhost',
  }
}

export function parseSelfhostTag(tag: string): { tag: string; version: string } | null {
  const raw = String(tag ?? '').trim()
  if (!raw.startsWith(SELFHOST_TAG_PREFIX)) return null
  const version = raw.slice(SELFHOST_TAG_PREFIX.length)
  if (!/^\d+\.\d+\.\d+(?:[-+].*)?$/.test(version)) return null
  return { tag: raw, version }
}

export function selfhostTagForVersion(version: string): string {
  const v = version.trim().replace(/^v/, '')
  return `${SELFHOST_TAG_PREFIX}${v}`
}

export function parseSemver(version: string): number[] | null {
  const m = String(version ?? '').trim().match(/^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/)
  if (!m) return null
  return [Number(m[1]), Number(m[2]), Number(m[3])]
}

export function compareSemver(a: string, b: string): number {
  const pa = parseSemver(a)
  const pb = parseSemver(b)
  if (!pa && !pb) return 0
  if (!pa) return -1
  if (!pb) return 1
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i]! < pb[i]! ? -1 : 1
  }
  return 0
}

function normalizeCdnBase(cdnBase: string): string {
  return cdnBase.trim().replace(/\/+$/, '') || DEFAULT_UPDATE_CDN_BASE
}

export function hotCheckUpdateUrl(cdnBase: string): string {
  return `${normalizeCdnBase(cdnBase)}/hot/check-update`
}

/** CDN package URLs — `opptrix-runtime-v{version}.bin` + `.sha256`. */
export function hotPackageUrls(version: string, cdnBase: string): {
  binUrl: string
  sha256Url: string
  binName: string
  sha256Name: string
} {
  const v = version.trim().replace(/^v/, '')
  const binName = `opptrix-runtime-v${v}.bin`
  const sha256Name = `opptrix-runtime-v${v}.sha256`
  const base = normalizeCdnBase(cdnBase)
  return {
    binUrl: `${base}/hot/packages/${binName}`,
    sha256Url: `${base}/hot/packages/${sha256Name}`,
    binName,
    sha256Name,
  }
}

function resolveCdnUrl(cdnBase: string, ref: string): string {
  const trimmed = ref.trim()
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  const base = normalizeCdnBase(cdnBase)
  if (trimmed.startsWith('/')) return `${base}${trimmed}`
  return `${base}/${trimmed}`
}

type JsonRecord = Record<string, unknown>

/** Defensive parse of `GET …/hot/check-update` payload. */
export function parseHotLatestPayload(
  raw: unknown,
  cdnBase: string,
): HotLatestRelease | null {
  if (typeof raw !== 'object' || raw === null) return null
  const root = raw as JsonRecord
  const latest = root.latest
  if (typeof latest !== 'object' || latest === null) return null
  const row = latest as JsonRecord

  const versionRaw =
    (typeof row.version === 'string' && row.version)
    || (typeof row.tag === 'string' && row.tag)
    || null
  if (!versionRaw) return null

  let version = versionRaw.trim().replace(/^v/, '')
  const fromTag = parseSelfhostTag(versionRaw)
  if (fromTag) version = fromTag.version
  if (!parseSemver(version)) return null

  const defaults = hotPackageUrls(version, cdnBase)
  const binRef = typeof row.bin === 'string' && row.bin.trim() ? row.bin.trim() : null
  const shaRef =
    (typeof row.sha256 === 'string' && row.sha256.trim() ? row.sha256.trim() : null)
    ?? (typeof row.sha === 'string' && row.sha.trim() ? row.sha.trim() : null)

  const binUrl = binRef ? resolveCdnUrl(cdnBase, binRef) : defaults.binUrl
  const sha256Url = shaRef ? resolveCdnUrl(cdnBase, shaRef) : defaults.sha256Url

  const size =
    typeof row.size === 'number' && Number.isFinite(row.size) && row.size >= 0
      ? row.size
      : null
  const publishedAt =
    typeof row.publishedAt === 'string' && row.publishedAt.trim()
      ? row.publishedAt.trim()
      : null

  return {
    version,
    binUrl,
    sha256Url,
    binName: defaults.binName,
    sha256Name: defaults.sha256Name,
    size,
    publishedAt,
  }
}

async function fetchCheckUpdateJson(
  url: string,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<unknown> {
  const ac = new AbortController()
  const onAbort = () => ac.abort()
  if (signal) {
    if (signal.aborted) ac.abort()
    else signal.addEventListener('abort', onAbort, { once: true })
  }
  const timer = setTimeout(() => ac.abort(), timeoutMs)
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'User-Agent': 'Opptrix-system-update',
      },
      signal: ac.signal,
    })
    if (!res.ok) {
      throw new Error(`check-update fetch failed (${res.status})`)
    }
    return await res.json()
  } finally {
    clearTimeout(timer)
    if (signal) signal.removeEventListener('abort', onAbort)
  }
}

/** Fetch latest hot-update descriptor from CDN check-update endpoint. */
export async function fetchHotLatest(
  env: ChannelEnv = readChannelEnv(),
  opts?: { timeoutMs?: number; signal?: AbortSignal },
): Promise<HotLatestRelease | null> {
  const timeoutMs = opts?.timeoutMs ?? 25_000
  const url = hotCheckUpdateUrl(env.cdnBase)
  const raw = await fetchCheckUpdateJson(url, timeoutMs, opts?.signal)
  return parseHotLatestPayload(raw, env.cdnBase)
}
