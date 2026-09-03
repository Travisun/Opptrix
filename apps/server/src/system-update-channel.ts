/**
 * CDN hot-update channel for selfhost runtime packages.
 * Default / authoritative base: https://update.opptrix.org
 * CN clients try https://update.opptrix.evzs.com first for check-update / releases.
 */
import {
  AUTHORITATIVE_UPDATE_CDN_BASE,
  CN_UPDATE_CDN_BASES,
  resolveCheckUpdateCdnBases as resolveCheckUpdateCdnBasesShared,
  type RuntimePackageMirrors,
  type UpdateMirrorProfile,
} from '@opptrix/system-update'
import {
  resolveLinuxRuntimeArchKey,
  runtimeArchBinBasename,
  runtimeArchSha256Basename,
  type LinuxRuntimeArchKey,
} from './system-update-arch.js'
import { buildSystemUpdateUserAgent } from './system-update-user-agent.js'

export const DEFAULT_UPDATE_CDN_BASE = AUTHORITATIVE_UPDATE_CDN_BASE

export { AUTHORITATIVE_UPDATE_CDN_BASE, CN_UPDATE_CDN_BASES }

export const SELFHOST_TAG_PREFIX = 'opptrix-selfhost-v'

export interface ChannelEnv {
  cdnBase: string
  channel: string
}

export interface HotReleaseDescription {
  features: string[]
  fixes: string[]
}

export interface HotLatestRelease {
  version: string
  binUrl: string
  sha256Url: string
  binName: string
  sha256Name: string
  size: number | null
  publishedAt: string | null
  archKey: LinuxRuntimeArchKey
  description: HotReleaseDescription
  mirrors?: RuntimePackageMirrors
}

export interface HotReleaseCatalogEntry extends HotLatestRelease {
  requires: {
    node: string | null
    minBaseImage: string | null
    platforms: LinuxRuntimeArchKey[]
  }
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

export function hotReleasesUrl(cdnBase: string): string {
  return `${normalizeCdnBase(cdnBase)}/hot/releases`
}

export function parseHotReleaseDescription(raw: unknown): HotReleaseDescription {
  if (typeof raw !== 'object' || raw === null) {
    return { features: [], fixes: [] }
  }
  const row = raw as JsonRecord
  const features = Array.isArray(row.features)
    ? row.features
      .filter((x): x is string => typeof x === 'string' && Boolean(x.trim()))
      .map((s) => s.trim())
    : []
  const fixes = Array.isArray(row.fixes)
    ? row.fixes
      .filter((x): x is string => typeof x === 'string' && Boolean(x.trim()))
      .map((s) => s.trim())
    : []
  return { features, fixes }
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

function parseMirrorBlock(raw: unknown): { bin?: string; sha256?: string } | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined
  const row = raw as JsonRecord
  const bin = typeof row.bin === 'string' && row.bin.trim() ? row.bin.trim() : undefined
  const sha256 =
    (typeof row.sha256 === 'string' && row.sha256.trim() ? row.sha256.trim() : undefined)
    ?? (typeof row.sha === 'string' && row.sha.trim() ? row.sha.trim() : undefined)
  if (!bin && !sha256) return undefined
  return { bin, sha256 }
}

function parsePackageMirrors(raw: unknown): RuntimePackageMirrors | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined
  const row = raw as JsonRecord
  const mirrorsRaw = row.mirrors
  if (typeof mirrorsRaw !== 'object' || mirrorsRaw === null) return undefined
  const mirrors = mirrorsRaw as JsonRecord
  const github = parseMirrorBlock(mirrors.github)
  // Old manifests may still carry mirrors.gitee — ignore safely.
  if (!github) return undefined
  return { github }
}

function parsePackageEntry(
  pkg: unknown,
  cdnBase: string,
): {
  binUrl: string
  sha256Url: string
  size: number | null
  mirrors?: RuntimePackageMirrors
} | null {
  if (typeof pkg !== 'object' || pkg === null) return null
  const row = pkg as JsonRecord
  const binRef = typeof row.bin === 'string' && row.bin.trim() ? row.bin.trim() : null
  const shaRef =
    (typeof row.sha256 === 'string' && row.sha256.trim() ? row.sha256.trim() : null)
    ?? (typeof row.sha === 'string' && row.sha.trim() ? row.sha.trim() : null)
  if (!binRef || !shaRef) return null
  const size =
    typeof row.size === 'number' && Number.isFinite(row.size) && row.size >= 0
      ? row.size
      : null
  return {
    binUrl: resolveCdnUrl(cdnBase, binRef),
    sha256Url: resolveCdnUrl(cdnBase, shaRef),
    size,
    mirrors: parsePackageMirrors(row),
  }
}

function basenameFromUrl(url: string, fallback: string): string {
  const segment = url.split('/').pop()?.split('?')[0]?.trim()
  return segment || fallback
}

function parseReleaseRowPackage(
  row: JsonRecord,
  cdnBase: string,
  archKey: LinuxRuntimeArchKey,
  version: string,
): HotLatestRelease | null {
  const archDefaults = {
    binName: runtimeArchBinBasename(version, archKey),
    sha256Name: runtimeArchSha256Basename(version, archKey),
  }

  const packages = row.packages
  if (typeof packages === 'object' && packages !== null) {
    const selected = parsePackageEntry((packages as JsonRecord)[archKey], cdnBase)
    if (selected) {
      return {
        version,
        binUrl: selected.binUrl,
        sha256Url: selected.sha256Url,
        binName: basenameFromUrl(selected.binUrl, archDefaults.binName),
        sha256Name: basenameFromUrl(selected.sha256Url, archDefaults.sha256Name),
        size: selected.size,
        publishedAt:
          typeof row.publishedAt === 'string' && row.publishedAt.trim()
            ? row.publishedAt.trim()
            : null,
        archKey,
        description: parseHotReleaseDescription(row.description),
        mirrors: selected.mirrors,
      }
    }
  }

  if (archKey !== 'linux-x64') return null

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
    archKey,
    description: parseHotReleaseDescription(row.description),
    mirrors: parsePackageMirrors(row),
  }
}

/** Defensive parse of `GET …/hot/check-update` payload. */
export function parseHotLatestPayload(
  raw: unknown,
  cdnBase: string,
  opts?: { archKey?: LinuxRuntimeArchKey },
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

  const archKey = opts?.archKey ?? resolveLinuxRuntimeArchKey()
  return parseReleaseRowPackage(row, cdnBase, archKey, version)
}

/** Parse one catalog entry from hot/releases or check-update releases[]. */
export function parseHotReleaseCatalogEntry(
  raw: unknown,
  cdnBase: string,
  opts?: { archKey?: LinuxRuntimeArchKey },
): HotReleaseCatalogEntry | null {
  if (typeof raw !== 'object' || raw === null) return null
  const row = raw as JsonRecord
  const versionRaw = typeof row.version === 'string' ? row.version.trim() : ''
  const version = versionRaw.replace(/^v/, '')
  if (!parseSemver(version)) return null

  const archKey = opts?.archKey ?? resolveLinuxRuntimeArchKey()
  const parsed = parseReleaseRowPackage(row, cdnBase, archKey, version)
  if (!parsed) return null

  const requiresRaw = row.requires
  const requires = typeof requiresRaw === 'object' && requiresRaw !== null
    ? requiresRaw as JsonRecord
    : {}

  const platformsRaw = requires.platforms
  const platforms = Array.isArray(platformsRaw)
    ? platformsRaw.filter((p): p is LinuxRuntimeArchKey => p === 'linux-x64' || p === 'linux-arm64')
    : [archKey]

  return {
    ...parsed,
    requires: {
      node: typeof requires.node === 'string' ? requires.node : null,
      minBaseImage: typeof requires.minBaseImage === 'string' ? requires.minBaseImage : null,
      platforms,
    },
  }
}

/** Parse hot/releases manifest (newest first, max 8). */
export function parseHotReleasesPayload(
  raw: unknown,
  cdnBase: string,
  opts?: { archKey?: LinuxRuntimeArchKey },
): HotReleaseCatalogEntry[] {
  if (typeof raw !== 'object' || raw === null) return []
  const root = raw as JsonRecord
  const releases = root.releases
  if (!Array.isArray(releases)) return []
  /** @type {HotReleaseCatalogEntry[]} */
  const out = []
  for (const row of releases) {
    const entry = parseHotReleaseCatalogEntry(row, cdnBase, opts)
    if (entry) out.push(entry)
  }
  return out
}

async function fetchCheckUpdateJson(
  url: string,
  timeoutMs: number,
  signal?: AbortSignal,
  userAgent?: string,
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
        'User-Agent': userAgent ?? buildSystemUpdateUserAgent(),
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

/**
 * CDN bases to try for check-update / releases list.
 * Always update.opptrix.org first; failover to CN mirror (same JSON).
 * Package downloads still silently rewrite host for `cn` profile.
 */
export function resolveCheckUpdateCdnBases(
  env: ChannelEnv = readChannelEnv(),
  _opts?: { profile?: UpdateMirrorProfile; processEnv?: NodeJS.ProcessEnv },
): string[] {
  return resolveCheckUpdateCdnBasesShared({
    configuredBase: env.cdnBase,
  })
}

async function fetchChannelJsonWithFailover(
  buildUrl: (cdnBase: string) => string,
  env: ChannelEnv,
  opts?: {
    timeoutMs?: number
    signal?: AbortSignal
    userAgent?: string
    profile?: UpdateMirrorProfile
    processEnv?: NodeJS.ProcessEnv
  },
): Promise<{ raw: unknown; cdnBase: string }> {
  const timeoutMs = opts?.timeoutMs ?? 25_000
  const bases = resolveCheckUpdateCdnBases(env, {
    profile: opts?.profile,
    processEnv: opts?.processEnv,
  })
  let lastErr: unknown = null
  for (const cdnBase of bases) {
    try {
      const raw = await fetchCheckUpdateJson(
        buildUrl(cdnBase),
        timeoutMs,
        opts?.signal,
        opts?.userAgent,
      )
      return { raw, cdnBase }
    } catch (err) {
      lastErr = err
    }
  }
  const message = lastErr instanceof Error ? lastErr.message : String(lastErr ?? 'fetch failed')
  throw new Error(message)
}

/** Fetch latest hot-update descriptor from CDN check-update endpoint. */
export async function fetchHotLatest(
  env: ChannelEnv = readChannelEnv(),
  opts?: {
    timeoutMs?: number
    signal?: AbortSignal
    userAgent?: string
    profile?: UpdateMirrorProfile
    processEnv?: NodeJS.ProcessEnv
  },
): Promise<HotLatestRelease | null> {
  const { raw, cdnBase } = await fetchChannelJsonWithFailover(hotCheckUpdateUrl, env, opts)
  return parseHotLatestPayload(raw, cdnBase, {
    archKey: resolveLinuxRuntimeArchKey(),
  })
}

/** Fetch retained release catalog from CDN hot/releases. */
export async function fetchHotReleases(
  env: ChannelEnv = readChannelEnv(),
  opts?: {
    timeoutMs?: number
    signal?: AbortSignal
    userAgent?: string
    profile?: UpdateMirrorProfile
    processEnv?: NodeJS.ProcessEnv
  },
): Promise<HotReleaseCatalogEntry[]> {
  const { raw, cdnBase } = await fetchChannelJsonWithFailover(hotReleasesUrl, env, opts)
  return parseHotReleasesPayload(raw, cdnBase, {
    archKey: resolveLinuxRuntimeArchKey(),
  })
}
