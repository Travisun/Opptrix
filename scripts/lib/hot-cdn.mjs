/**
 * Pure helpers for Opptrix self-host hot-update CDN paths and check-update JSON.
 * Shared by scripts/sync-hot-to-r2.mjs and tests.
 */
import fs from 'node:fs'

export const DEFAULT_HOT_CDN_BASE = 'https://update.opptrix.org'

export const DEFAULT_RUNTIME_NODE_RANGE = '>=24 <25'

export const SELFHOST_TAG_PREFIX = 'opptrix-selfhost-v'

export const HOT_PACKAGES_PREFIX = 'hot/packages'

export const HOT_CHECK_UPDATE_KEY = 'hot/check-update'

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
 * @param {string} [cdnBase]
 */
export function hotCheckUpdateUrl(cdnBase = DEFAULT_HOT_CDN_BASE) {
  return `${normalizeCdnBase(cdnBase)}/${HOT_CHECK_UPDATE_KEY}`
}

/**
 * @param {string} objectKey
 */
export function contentTypeForHotObjectKey(objectKey) {
  if (objectKey === HOT_CHECK_UPDATE_KEY || objectKey.endsWith('/check-update')) {
    return 'application/json; charset=utf-8'
  }
  if (objectKey.endsWith('.bin')) return 'application/octet-stream'
  return 'application/octet-stream'
}

/**
 * @param {{
 *   version: string
 *   cdnBase?: string
 *   binSize: number
 *   publishedAt?: string
 *   nodeRange?: string
 *   minBaseImage?: string
 *   channel?: string
 * }} input
 */
export function buildCheckUpdatePayload(input) {
  const version = normalizeHotVersion(input.version)
  const cdnBase = normalizeCdnBase(input.cdnBase)
  const urls = hotPackageUrls(version, cdnBase)
  const binSize = Number(input.binSize)
  if (!Number.isFinite(binSize) || binSize < 0) {
    throw new Error(`invalid binSize: ${input.binSize}`)
  }

  const publishedAt = input.publishedAt?.trim()
    || new Date().toISOString()

  const minBaseImage = input.minBaseImage?.trim()
    || selfhostTagForVersion(version)

  const nodeRange = input.nodeRange?.trim()
    || DEFAULT_RUNTIME_NODE_RANGE

  const channel = input.channel?.trim() || 'selfhost'

  return {
    channel,
    latest: {
      version,
      bin: urls.binUrl,
      sha256: urls.sha256Url,
      size: binSize,
      publishedAt,
      requires: {
        node: nodeRange,
        minBaseImage,
      },
    },
  }
}

/**
 * Resolve local `.bin` + `.sha256` paths produced by pack-opptrix-runtime.mjs.
 * @param {string} dir
 * @param {string} version
 */
export function collectHotRuntimeFiles(dir, version) {
  const v = normalizeHotVersion(version)
  const binName = runtimeBinFilename(v)
  const sha256Name = runtimeBinSha256Filename(v)
  return {
    binName,
    sha256Name,
    binPath: `${dir.replace(/\/+$/, '')}/${binName}`,
    sha256Path: `${dir.replace(/\/+$/, '')}/${sha256Name}`,
    packageKey: hotPackageObjectKey(v),
    sha256Key: hotSha256ObjectKey(v),
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
  return [
    hotCheckUpdateUrl(base),
    urls.binUrl,
    urls.sha256Url,
  ]
}

/**
 * Resolve local `.bin` + `.sha256` and validate they exist on disk.
 * @param {string} dir
 * @param {string} version
 */
export function resolveHotUploadPlan(dir, version) {
  const v = normalizeHotVersion(version)
  const files = collectHotRuntimeFiles(dir, v)
  if (!fs.existsSync(files.binPath) || !fs.statSync(files.binPath).isFile()) {
    throw new Error(`missing runtime .bin: ${files.binPath}`)
  }
  if (!fs.existsSync(files.sha256Path) || !fs.statSync(files.sha256Path).isFile()) {
    throw new Error(`missing runtime .sha256 sidecar: ${files.sha256Path}`)
  }
  const binSize = fs.statSync(files.binPath).size
  return { version: v, files, binSize }
}
