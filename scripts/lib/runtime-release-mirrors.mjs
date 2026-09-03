/**
 * GitHub release download URLs for runtime hot-update packages.
 * CDN (update.opptrix.org) remains authoritative; CN also tries update.opptrix.evzs.com.
 * Gitee is not used for runtime package download failover.
 */

/** Authoritative check-update / publish target. */
export const AUTHORITATIVE_UPDATE_CDN_BASE = 'https://update.opptrix.org'

/**
 * CN package CDN bases for silent host rewrite (first = preferred download).
 * check-update order is resolveCheckUpdateCdnBases (org first).
 */
export const CN_UPDATE_CDN_BASES = [
  'https://update.opptrix.evzs.com',
  AUTHORITATIVE_UPDATE_CDN_BASE,
]
const SELFHOST_TAG_PREFIX = 'opptrix-selfhost-v'
const RUNTIME_TAG_PREFIX = 'runtime-v'

/** @type {readonly ['linux-x64', 'linux-arm64']} */
const RUNTIME_LINUX_ARCH_KEYS = ['linux-x64', 'linux-arm64']

/**
 * @param {string} version
 */
function normalizeHotVersion(version) {
  const v = String(version ?? '').trim().replace(/^v/, '')
  if (!/^\d+\.\d+\.\d+(?:[-+].*)?$/.test(v)) {
    throw new Error(`invalid version "${version}" (expect X.Y.Z)`)
  }
  return v
}

/**
 * Docker / app snapshot tag (`opptrix-selfhost-v*`) — used for minBaseImage, not asset mirrors.
 * @param {string} version
 */
export function selfhostTagForVersion(version) {
  return `${SELFHOST_TAG_PREFIX}${normalizeHotVersion(version)}`
}

/**
 * Runtime hot-update GitHub release tag (`runtime-v*`).
 * @param {string} version
 */
export function runtimeReleaseTagForVersion(version) {
  return `${RUNTIME_TAG_PREFIX}${normalizeHotVersion(version)}`
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

export const DEFAULT_GITHUB_REPO = 'Travisun/Opptrix'
export const DEFAULT_GITEE_REPO = 'Travisun/Opptrix'

/**
 * @param {string} version
 */
export function normalizeReleaseVersion(version) {
  return String(version ?? '').trim().replace(/^v/i, '')
}

/**
 * @param {string} version
 */
export function releaseTagForVersion(version) {
  return runtimeReleaseTagForVersion(normalizeReleaseVersion(version))
}

/**
 * @param {string} repo  owner/name
 * @param {string} tag
 * @param {string} filename
 */
export function githubReleaseAssetUrl(repo, tag, filename) {
  const [owner, name] = String(repo).split('/').filter(Boolean)
  if (!owner || !name) throw new Error(`invalid github repo: ${repo}`)
  return `https://github.com/${owner}/${name}/releases/download/${tag}/${filename}`
}

/**
 * @param {string} repo  owner/name
 * @param {string} tag
 * @param {string} filename
 */
export function giteeReleaseAssetUrl(repo, tag, filename) {
  const [owner, name] = String(repo).split('/').filter(Boolean)
  if (!owner || !name) throw new Error(`invalid gitee repo: ${repo}`)
  return `https://gitee.com/${owner}/${name}/releases/download/${tag}/${filename}`
}

/**
 * @param {string} version
 * @param {string} filename
 * @param {{
 *   githubRepo?: string,
 *   giteeRepo?: string,
 *   tag?: string,
 * }} [opts]
 */
export function buildReleaseAssetMirrorPair(version, filename, opts = {}) {
  const tag = opts.tag ?? releaseTagForVersion(version)
  const githubRepo = opts.githubRepo ?? DEFAULT_GITHUB_REPO
  // giteeRepo retained in opts for API compat; new manifests no longer emit gitee URLs.
  void opts.giteeRepo
  return {
    github: githubReleaseAssetUrl(githubRepo, tag, filename),
  }
}

/**
 * @param {string} version
 * @param {'linux-x64' | 'linux-arm64'} archKey
 * @param {{ githubRepo?: string, giteeRepo?: string, tag?: string }} [opts]
 */
export function buildArchPackageMirrors(version, archKey, opts = {}) {
  const v = normalizeReleaseVersion(version)
  const binName = runtimeArchBinFilename(v, archKey)
  const shaName = runtimeArchBinSha256Filename(v, archKey)
  const bin = buildReleaseAssetMirrorPair(v, binName, opts)
  const sha = buildReleaseAssetMirrorPair(v, shaName, opts)
  return {
    github: { bin: bin.github, sha256: sha.github },
  }
}

/**
 * Legacy x64 alias mirrors (latest.bin / latest.sha256).
 * @param {string} version
 * @param {{ githubRepo?: string, giteeRepo?: string, tag?: string }} [opts]
 */
export function buildLegacyPackageMirrors(version, opts = {}) {
  const v = normalizeReleaseVersion(version)
  const binName = runtimeBinFilename(v)
  const shaName = runtimeBinSha256Filename(v)
  const bin = buildReleaseAssetMirrorPair(v, binName, opts)
  const sha = buildReleaseAssetMirrorPair(v, shaName, opts)
  return {
    github: { bin: bin.github, sha256: sha.github },
  }
}

/**
 * @param {unknown} raw
 */
export function parsePackageMirrors(raw) {
  if (typeof raw !== 'object' || raw === null) {
    return { github: undefined }
  }
  const row = /** @type {Record<string, unknown>} */ (raw)
  /**
   * @param {unknown} block
   */
  function pick(block) {
    if (typeof block !== 'object' || block === null) return undefined
    const b = /** @type {Record<string, unknown>} */ (block)
    const bin = typeof b.bin === 'string' && b.bin.trim() ? b.bin.trim() : undefined
    const sha256 = typeof b.sha256 === 'string' && b.sha256.trim() ? b.sha256.trim() : undefined
    if (!bin && !sha256) return undefined
    return { bin, sha256 }
  }
  const mirrors = row.mirrors
  if (typeof mirrors !== 'object' || mirrors === null) {
    return { github: undefined }
  }
  const m = /** @type {Record<string, unknown>} */ (mirrors)
  // Old manifests may still carry mirrors.gitee — ignore safely.
  return {
    github: pick(m.github),
  }
}

/**
 * @typedef {'cn' | 'foreign'} UpdateMirrorProfile
 * @typedef {'cdn_cn' | 'cdn' | 'github'} RuntimeDownloadSource
 */

/**
 * @param {string} base
 */
function normalizeCdnBase(base) {
  return String(base ?? '').trim().replace(/\/+$/, '') || AUTHORITATIVE_UPDATE_CDN_BASE
}

/**
 * CDN bases for check-update / releases: authoritative org first, then CN failover.
 * @param {{ configuredBase?: string }} [opts]
 * @returns {string[]}
 */
export function resolveCheckUpdateCdnBases(opts = {}) {
  const seen = new Set()
  /** @type {string[]} */
  const out = []
  /**
   * @param {string} raw
   */
  function push(raw) {
    const base = normalizeCdnBase(raw)
    if (seen.has(base)) return
    seen.add(base)
    out.push(base)
  }
  push(AUTHORITATIVE_UPDATE_CDN_BASE)
  if (opts.configuredBase) push(opts.configuredBase)
  for (const base of CN_UPDATE_CDN_BASES) {
    push(base)
  }
  return out
}

/**
 * Same path/query/hash under a different CDN host.
 * @param {string} url
 * @param {string} newBase
 */
export function rewriteCdnBase(url, newBase) {
  const base = normalizeCdnBase(newBase)
  try {
    const parsed = new URL(url)
    const next = new URL(base)
    return `${next.origin}${parsed.pathname}${parsed.search}${parsed.hash}`
  } catch {
    return url
  }
}

/**
 * @param {UpdateMirrorProfile} profile
 * @returns {RuntimeDownloadSource[]}
 */
export function mirrorSourceOrder(profile) {
  return profile === 'cn'
    ? ['cdn_cn', 'cdn', 'github']
    : ['cdn', 'github']
}

/**
 * @param {{
 *   binUrl: string,
 *   sha256Url: string,
 *   mirrors?: ReturnType<typeof parsePackageMirrors>,
 * }} refs
 * @param {UpdateMirrorProfile} profile
 * @returns {Array<{ binUrl: string, sha256Url: string, source: RuntimeDownloadSource }>}
 */
export function buildRuntimeDownloadCandidates(refs, profile) {
  const cdnBin = String(refs.binUrl ?? '').trim()
  const cdnSha = String(refs.sha256Url ?? '').trim()
  if (!cdnBin || !cdnSha) throw new Error('buildRuntimeDownloadCandidates: missing CDN refs')

  /** @type {Array<{ binUrl: string, sha256Url: string, source: RuntimeDownloadSource }>} */
  const out = []
  const seen = new Set()

  /**
   * @param {RuntimeDownloadSource} source
   * @param {string | undefined} bin
   * @param {string | undefined} sha
   */
  function push(source, bin, sha) {
    const b = String(bin ?? '').trim()
    const s = String(sha ?? '').trim()
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
      const source = /** @type {RuntimeDownloadSource} */ (i === 0 ? 'cdn_cn' : 'cdn')
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
