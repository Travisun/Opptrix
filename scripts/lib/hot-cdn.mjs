/**
 * Pure helpers for Opptrix self-host hot-update CDN paths and check-update JSON.
 * Shared by scripts/sync-hot-to-r2.mjs and tests.
 */
import fs from 'node:fs'
import {
  buildArchPackageMirrors,
  buildLegacyPackageMirrors,
} from './runtime-release-mirrors.mjs'

export const DEFAULT_HOT_CDN_BASE = 'https://update.opptrix.org'

export const DEFAULT_RUNTIME_NODE_RANGE = '>=24 <25'

export const SELFHOST_TAG_PREFIX = 'opptrix-selfhost-v'

export const HOT_PACKAGES_PREFIX = 'hot/packages'

export const HOT_CHECK_UPDATE_KEY = 'hot/check-update'

export const HOT_RELEASES_KEY = 'hot/releases'

/** Max runtime versions retained on CDN manifest (newest first). */
export const HOT_RELEASES_RETENTION_MAX = 8

/** @type {readonly ['linux-x64', 'linux-arm64']} */
export const RUNTIME_LINUX_ARCH_KEYS = ['linux-x64', 'linux-arm64']

/**
 * @param {string} cdnBase
 */
export function normalizeCdnBase(cdnBase) {
  const raw = String(cdnBase ?? DEFAULT_HOT_CDN_BASE).trim()
  return raw.replace(/\/+$/, '') || DEFAULT_HOT_CDN_BASE
}

/**
 * @param {string} version
 */
export function normalizeHotVersion(version) {
  const v = String(version ?? '').trim().replace(/^v/, '')
  if (!/^\d+\.\d+\.\d+(?:[-+].*)?$/.test(v)) {
    throw new Error(`invalid version "${version}" (expect X.Y.Z)`)
  }
  return v
}

/**
 * Legacy x64 alias basename (backward compatible check-update `latest.bin`).
 * @param {string} version
 */
export function runtimeBinFilename(version) {
  return `opptrix-runtime-v${normalizeHotVersion(version)}.bin`
}

/**
 * @param {string} version
 */
export function runtimeBinSha256Filename(version) {
  return `opptrix-runtime-v${normalizeHotVersion(version)}.sha256`
}

/**
 * Per-arch CDN `.bin` basename.
 * @param {string} version
 * @param {'linux-x64' | 'linux-arm64'} archKey
 */
export function runtimeArchBinFilename(version, archKey) {
  const v = normalizeHotVersion(version)
  if (!RUNTIME_LINUX_ARCH_KEYS.includes(archKey)) {
    throw new Error(`unsupported runtime arch key "${archKey}"`)
  }
  return `opptrix-runtime-${archKey}-v${v}.bin`
}

/**
 * @param {string} version
 * @param {'linux-x64' | 'linux-arm64'} archKey
 */
export function runtimeArchBinSha256Filename(version, archKey) {
  const v = normalizeHotVersion(version)
  if (!RUNTIME_LINUX_ARCH_KEYS.includes(archKey)) {
    throw new Error(`unsupported runtime arch key "${archKey}"`)
  }
  return `opptrix-runtime-${archKey}-v${v}.sha256`
}

/**
 * @param {string} version
 */
export function selfhostTagForVersion(version) {
  return `${SELFHOST_TAG_PREFIX}${normalizeHotVersion(version)}`
}

/**
 * @param {string} version
 */
export function hotPackageObjectKey(version) {
  return `${HOT_PACKAGES_PREFIX}/${runtimeBinFilename(version)}`
}

/**
 * @param {string} version
 */
export function hotSha256ObjectKey(version) {
  return `${HOT_PACKAGES_PREFIX}/${runtimeBinSha256Filename(version)}`
}

/**
 * @param {string} version
 * @param {'linux-x64' | 'linux-arm64'} archKey
 */
export function hotArchPackageObjectKey(version, archKey) {
  return `${HOT_PACKAGES_PREFIX}/${runtimeArchBinFilename(version, archKey)}`
}

/**
 * @param {string} version
 * @param {'linux-x64' | 'linux-arm64'} archKey
 */
export function hotArchSha256ObjectKey(version, archKey) {
  return `${HOT_PACKAGES_PREFIX}/${runtimeArchBinSha256Filename(version, archKey)}`
}

/**
 * @param {string} version
 * @param {string} [cdnBase]
 */
export function hotPackageUrls(version, cdnBase = DEFAULT_HOT_CDN_BASE) {
  const base = normalizeCdnBase(cdnBase)
  const binName = runtimeBinFilename(version)
  const sha256Name = runtimeBinSha256Filename(version)
  return {
    binName,
    sha256Name,
    binUrl: `${base}/${HOT_PACKAGES_PREFIX}/${binName}`,
    sha256Url: `${base}/${HOT_PACKAGES_PREFIX}/${sha256Name}`,
  }
}

/**
 * @param {string} version
 * @param {'linux-x64' | 'linux-arm64'} archKey
 * @param {string} [cdnBase]
 */
export function hotArchPackageUrls(version, archKey, cdnBase = DEFAULT_HOT_CDN_BASE) {
  const base = normalizeCdnBase(cdnBase)
  const binName = runtimeArchBinFilename(version, archKey)
  const sha256Name = runtimeArchBinSha256Filename(version, archKey)
  return {
    archKey,
    binName,
    sha256Name,
    binUrl: `${base}/${HOT_PACKAGES_PREFIX}/${binName}`,
    sha256Url: `${base}/${HOT_PACKAGES_PREFIX}/${sha256Name}`,
  }
}

/**
 * @param {string} [cdnBase]
 */
export function hotCheckUpdateUrl(cdnBase = DEFAULT_HOT_CDN_BASE) {
  return `${normalizeCdnBase(cdnBase)}/${HOT_CHECK_UPDATE_KEY}`
}

/**
 * @param {string} [cdnBase]
 */
export function hotReleasesUrl(cdnBase = DEFAULT_HOT_CDN_BASE) {
  return `${normalizeCdnBase(cdnBase)}/${HOT_RELEASES_KEY}`
}

/**
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
export function compareHotSemver(a, b) {
  const pa = normalizeHotVersion(a).split(/[.-]/).map((x) => Number.parseInt(x, 10))
  const pb = normalizeHotVersion(b).split(/[.-]/).map((x) => Number.parseInt(x, 10))
  for (let i = 0; i < 3; i++) {
    const da = pa[i] ?? 0
    const db = pb[i] ?? 0
    if (da !== db) return da < db ? -1 : 1
  }
  return 0
}

/**
 * @param {{
 *   version: string
 *   cdnBase?: string
 *   packages: Record<string, { binSize: number }>
 *   publishedAt?: string
 *   nodeRange?: string
 *   minBaseImage?: string
 *   description?: { features?: string[], fixes?: string[] }
 *   mirrorOpts?: { githubRepo?: string, giteeRepo?: string, tag?: string }
 * }} input
 */
export function buildReleaseEntry(input) {
  const version = normalizeHotVersion(input.version)
  const cdnBase = normalizeCdnBase(input.cdnBase)
  const publishedAt = input.publishedAt?.trim() || new Date().toISOString()
  const minBaseImage = input.minBaseImage?.trim() || selfhostTagForVersion(version)
  const nodeRange = input.nodeRange?.trim() || DEFAULT_RUNTIME_NODE_RANGE
  const mirrorOpts = {
    ...(input.mirrorOpts ?? {}),
    tag: input.mirrorOpts?.tag ?? selfhostTagForVersion(version),
  }

  /** @type {Record<string, { bin: string, sha256: string, size: number, mirrors: ReturnType<typeof buildArchPackageMirrors> }>} */
  const packages = {}
  for (const archKey of RUNTIME_LINUX_ARCH_KEYS) {
    const entry = input.packages[archKey]
    if (!entry) continue
    const binSize = Number(entry.binSize)
    if (!Number.isFinite(binSize) || binSize < 0) {
      throw new Error(`invalid binSize for ${archKey}: ${entry.binSize}`)
    }
    const urls = hotArchPackageUrls(version, archKey, cdnBase)
    packages[archKey] = {
      bin: urls.binUrl,
      sha256: urls.sha256Url,
      size: binSize,
      mirrors: buildArchPackageMirrors(version, archKey, mirrorOpts),
    }
  }
  if (Object.keys(packages).length === 0) {
    throw new Error(`buildReleaseEntry: no packages for ${version}`)
  }

  const desc = input.description ?? {}
  return {
    version,
    publishedAt,
    description: {
      features: Array.isArray(desc.features) ? desc.features.filter(Boolean) : [],
      fixes: Array.isArray(desc.fixes) ? desc.fixes.filter(Boolean) : [],
    },
    packages,
    requires: {
      node: nodeRange,
      minBaseImage,
      platforms: RUNTIME_LINUX_ARCH_KEYS.filter((k) => packages[k]),
    },
  }
}

/**
 * Merge release history; newest first; cap at max entries.
 * @param {Array<Record<string, unknown>>} existing
 * @param {Record<string, unknown>} newEntry
 * @param {number} [max]
 */
export function mergeReleaseHistory(existing, newEntry, max = HOT_RELEASES_RETENTION_MAX) {
  /** @type {Map<string, Record<string, unknown>>} */
  const byVersion = new Map()
  for (const row of existing) {
    if (typeof row?.version === 'string') byVersion.set(row.version, row)
  }
  byVersion.set(String(newEntry.version), newEntry)
  return [...byVersion.values()]
    .sort((a, b) => compareHotSemver(String(b.version), String(a.version)))
    .slice(0, max)
}

/**
 * @param {{
 *   channel?: string
 *   releases: Array<Record<string, unknown>>
 *   retentionMax?: number
 * }} input
 */
export function buildReleasesManifest(input) {
  const channel = input.channel?.trim() || 'selfhost'
  const max = input.retentionMax ?? HOT_RELEASES_RETENTION_MAX
  return {
    channel,
    retention: { max },
    releases: input.releases.slice(0, max),
  }
}

/**
 * @param {string} cdnBase
 * @param {number} [timeoutMs]
 */
export async function fetchHotReleasesManifest(cdnBase, timeoutMs = 25_000) {
  const url = hotReleasesUrl(cdnBase)
  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(timeoutMs),
  })
  if (!res.ok) return null
  const body = await res.json()
  if (typeof body !== 'object' || body === null) return null
  const releases = /** @type {{ releases?: unknown }} */ (body).releases
  if (!Array.isArray(releases)) return null
  return /** @type {Array<Record<string, unknown>>} */ (releases)
}

/**
 * @param {string} objectKey
 */
export function contentTypeForHotObjectKey(objectKey) {
  if (
    objectKey === HOT_CHECK_UPDATE_KEY
    || objectKey === HOT_RELEASES_KEY
    || objectKey.endsWith('/check-update')
    || objectKey.endsWith('/releases')
  ) {
    return 'application/json; charset=utf-8'
  }
  if (objectKey.endsWith('.bin')) return 'application/octet-stream'
  return 'application/octet-stream'
}

/**
 * @param {{
 *   version: string
 *   cdnBase?: string
 *   binSize?: number
 *   packages?: Record<string, { binSize: number }>
 *   publishedAt?: string
 *   nodeRange?: string
 *   minBaseImage?: string
 *   channel?: string
 *   description?: { features?: string[], fixes?: string[] }
 *   releases?: Array<Record<string, unknown>>
 * }} input
 */
export function buildCheckUpdatePayload(input) {
  const version = normalizeHotVersion(input.version)
  const cdnBase = normalizeCdnBase(input.cdnBase)

  /** @type {Record<string, { binSize: number }>} */
  const packagesInput = { ...(input.packages ?? {}) }
  if (Object.keys(packagesInput).length === 0) {
    const binSize = Number(input.binSize)
    if (!Number.isFinite(binSize) || binSize < 0) {
      throw new Error(`invalid binSize: ${input.binSize}`)
    }
    packagesInput['linux-x64'] = { binSize }
  }

  const channel = input.channel?.trim() || 'selfhost'

  const releaseEntry = buildReleaseEntry({
    version,
    cdnBase,
    packages: packagesInput,
    publishedAt: input.publishedAt,
    nodeRange: input.nodeRange,
    minBaseImage: input.minBaseImage,
    description: input.description,
  })

  const legacyUrls = hotPackageUrls(version, cdnBase)
  const x64 = releaseEntry.packages['linux-x64']
  const legacySize = x64?.size ?? releaseEntry.packages[Object.keys(releaseEntry.packages)[0]].size

  const latest = {
    ...releaseEntry,
    bin: legacyUrls.binUrl,
    sha256: legacyUrls.sha256Url,
    size: legacySize,
    mirrors: buildLegacyPackageMirrors(version, {
      tag: selfhostTagForVersion(version),
    }),
  }

  const releases = Array.isArray(input.releases) && input.releases.length > 0
    ? input.releases.slice(0, HOT_RELEASES_RETENTION_MAX)
    : [releaseEntry]

  return {
    channel,
    retention: { max: HOT_RELEASES_RETENTION_MAX },
    latest,
    releases,
  }
}

/**
 * Fetch existing releases, merge new entry, build manifests for upload.
 * @param {{
 *   version: string
 *   cdnBase?: string
 *   packages: Record<string, { binSize: number }>
 *   description?: { features?: string[], fixes?: string[] }
 *   publishedAt?: string
 *   nodeRange?: string
 *   minBaseImage?: string
 *   channel?: string
 * }} input
 */
export async function prepareHotReleaseSync(input) {
  const cdnBase = normalizeCdnBase(input.cdnBase)
  const newEntry = buildReleaseEntry({
    version: input.version,
    cdnBase,
    packages: input.packages,
    publishedAt: input.publishedAt,
    nodeRange: input.nodeRange,
    minBaseImage: input.minBaseImage,
    description: input.description,
  })
  const existing = (await fetchHotReleasesManifest(cdnBase).catch(() => null)) ?? []
  const merged = mergeReleaseHistory(existing, newEntry)
  const channel = input.channel?.trim() || 'selfhost'
  const releasesManifest = buildReleasesManifest({ channel, releases: merged })
  const checkUpdate = buildCheckUpdatePayload({
    version: input.version,
    cdnBase,
    packages: input.packages,
    publishedAt: input.publishedAt,
    nodeRange: input.nodeRange,
    minBaseImage: input.minBaseImage,
    channel,
    description: input.description,
    releases: merged,
  })
  return { newEntry, merged, releasesManifest, checkUpdate }
}

/**
 * Resolve local legacy `.bin` + `.sha256` paths produced by pack-opptrix-runtime.mjs.
 * @param {string} dir
 * @param {string} version
 */
export function collectHotRuntimeFiles(dir, version) {
  const v = normalizeHotVersion(version)
  const binName = runtimeBinFilename(v)
  const sha256Name = runtimeBinSha256Filename(v)
  const base = dir.replace(/\/+$/, '')
  return {
    binName,
    sha256Name,
    binPath: `${base}/${binName}`,
    sha256Path: `${base}/${sha256Name}`,
    packageKey: hotPackageObjectKey(v),
    sha256Key: hotSha256ObjectKey(v),
  }
}

/**
 * Resolve per-arch `.bin` + `.sha256` paths.
 * @param {string} dir
 * @param {string} version
 * @param {'linux-x64' | 'linux-arm64'} archKey
 */
export function collectHotRuntimeArchFiles(dir, version, archKey) {
  const v = normalizeHotVersion(version)
  const binName = runtimeArchBinFilename(v, archKey)
  const sha256Name = runtimeArchBinSha256Filename(v, archKey)
  const base = dir.replace(/\/+$/, '')
  return {
    archKey,
    binName,
    sha256Name,
    binPath: `${base}/${binName}`,
    sha256Path: `${base}/${sha256Name}`,
    packageKey: hotArchPackageObjectKey(v, archKey),
    sha256Key: hotArchSha256ObjectKey(v, archKey),
  }
}

/**
 * URLs to purge after hot CDN upload.
 * @param {string} version
 * @param {string} [cdnBase]
 */
export function hotPurgeUrls(version, cdnBase = DEFAULT_HOT_CDN_BASE) {
  const base = normalizeCdnBase(cdnBase)
  const urls = hotPackageUrls(version, base)
  /** @type {string[]} */
  const out = [
    hotCheckUpdateUrl(base),
    hotReleasesUrl(base),
    urls.binUrl,
    urls.sha256Url,
  ]
  for (const archKey of RUNTIME_LINUX_ARCH_KEYS) {
    const archUrls = hotArchPackageUrls(version, archKey, base)
    out.push(archUrls.binUrl, archUrls.sha256Url)
  }
  return [...new Set(out)]
}

/**
 * Resolve local `.bin` + `.sha256` and validate they exist on disk (legacy single-arch).
 * @param {string} dir
 * @param {string} version
 */
export function resolveHotUploadPlan(dir, version) {
  const multi = resolveHotMultiArchUploadPlan(dir, version)
  const x64 = multi.archPlans.find((p) => p.archKey === 'linux-x64')
  if (x64) {
    return { version: multi.version, files: x64.files, binSize: x64.binSize }
  }
  if (multi.legacy) {
    return {
      version: multi.version,
      files: multi.legacy,
      binSize: fs.statSync(multi.legacy.binPath).size,
    }
  }
  throw new Error(`missing runtime .bin for version ${multi.version}`)
}

/**
 * Resolve all arch-specific packages (+ optional legacy x64 alias) on disk.
 * @param {string} dir
 * @param {string} version
 */
export function resolveHotMultiArchUploadPlan(dir, version) {
  const v = normalizeHotVersion(version)
  /** @type {Array<{ archKey: string, files: ReturnType<typeof collectHotRuntimeArchFiles>, binSize: number }>} */
  const archPlans = []

  for (const archKey of RUNTIME_LINUX_ARCH_KEYS) {
    const files = collectHotRuntimeArchFiles(dir, v, archKey)
    if (fs.existsSync(files.binPath) && fs.statSync(files.binPath).isFile()
      && fs.existsSync(files.sha256Path) && fs.statSync(files.sha256Path).isFile()) {
      archPlans.push({
        archKey,
        files,
        binSize: fs.statSync(files.binPath).size,
      })
    }
  }

  const legacy = collectHotRuntimeFiles(dir, v)
  const hasLegacy = fs.existsSync(legacy.binPath) && fs.statSync(legacy.binPath).isFile()
    && fs.existsSync(legacy.sha256Path) && fs.statSync(legacy.sha256Path).isFile()

  if (archPlans.length === 0 && !hasLegacy) {
    throw new Error(
      `missing runtime packages in ${dir} for ${v} `
        + `(expected opptrix-runtime-linux-{x64,arm64}-v${v}.bin or legacy opptrix-runtime-v${v}.bin)`,
    )
  }

  /** @type {Record<string, { binSize: number }>} */
  const packages = {}
  for (const plan of archPlans) {
    packages[plan.archKey] = { binSize: plan.binSize }
  }
  if (hasLegacy && !packages['linux-x64']) {
    packages['linux-x64'] = { binSize: fs.statSync(legacy.binPath).size }
  }

  return { version: v, packages, archPlans, legacy: hasLegacy ? legacy : null }
}
