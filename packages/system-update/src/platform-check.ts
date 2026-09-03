/**
 * Evaluate `RuntimeMarker.requires` against the running Node / OS / host base.
 */
import type { RuntimeMarker, RuntimeRequires } from './runtime-marker.js'
import { isDockerEnv } from './paths.js'

export type RuntimeCheckEnv = {
  nodeVersion?: string
  platform?: NodeJS.Platform | string
  arch?: string
  /** Host base image tag, e.g. `opptrix-selfhost-v1.4.0` or bare `1.4.0`. */
  baseVersion?: string | null
  /** Override Docker detection (defaults to `isDockerEnv()`). */
  isDocker?: boolean
}

export type RuntimeRequiresResult = {
  ok: boolean
  needsBaseRefresh: boolean
  reasons: string[]
}

type SemVer = [number, number, number]

const BASE_IMAGE_TAG_PREFIX = 'opptrix-selfhost-v'

function parseSemVer(raw: string): SemVer | null {
  const cleaned = raw.trim().replace(/^v/i, '')
  if (!cleaned) return null
  // strip pre-release / build
  const core = cleaned.split('-')[0]?.split('+')[0] ?? ''
  if (!/^\d+(\.\d+)*$/.test(core)) return null
  const parts = core.split('.').map(p => Number.parseInt(p, 10))
  return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0]
}

function cmpSemVer(a: SemVer, b: SemVer): number {
  for (let i = 0; i < 3; i += 1) {
    const av = a[i] ?? 0
    const bv = b[i] ?? 0
    if (av !== bv) return av < bv ? -1 : 1
  }
  return 0
}

/**
 * Parse semver from `opptrix-selfhost-vX.Y.Z` or bare `X.Y.Z`.
 */
export function parseBaseImageVersion(raw: string): SemVer | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  const withoutPrefix = trimmed.startsWith(BASE_IMAGE_TAG_PREFIX)
    ? trimmed.slice(BASE_IMAGE_TAG_PREFIX.length)
    : trimmed
  return parseSemVer(withoutPrefix)
}

/**
 * Resolve host base version from env.
 * Order: explicit env override → `OPPTRIX_BASE_VERSION` → `OPPTRIX_RELEASE_TAG` when selfhost tag.
 */
export function resolveHostBaseVersion(env?: RuntimeCheckEnv): string | null {
  const explicit = env?.baseVersion
  if (explicit != null && String(explicit).trim()) {
    return String(explicit).trim()
  }

  const fromBase = process.env.OPPTRIX_BASE_VERSION?.trim()
  if (fromBase) return fromBase

  const releaseTag = process.env.OPPTRIX_RELEASE_TAG?.trim()
  if (releaseTag?.startsWith(BASE_IMAGE_TAG_PREFIX)) return releaseTag

  return null
}

/**
 * Prefer hot-update runtime (`state.currentVersion`) over baked app / image version.
 */
export function preferRuntimeAppVersion(
  runtimeVersion: string | null | undefined,
  fallbackVersion: string,
): string {
  const runtime = typeof runtimeVersion === 'string' ? runtimeVersion.trim() : ''
  return runtime || fallbackVersion
}

/**
 * Product-facing base label: strip `opptrix-selfhost-v` / leading `v`.
 */
export function normalizeBaseVersionLabel(raw: string | null | undefined): string | null {
  if (raw == null) return null
  const trimmed = String(raw).trim()
  if (!trimmed) return null
  if (trimmed.startsWith(BASE_IMAGE_TAG_PREFIX)) {
    const rest = trimmed.slice(BASE_IMAGE_TAG_PREFIX.length).trim()
    return rest || trimmed
  }
  const withoutV = trimmed.replace(/^v/i, '').trim()
  return withoutV || trimmed
}

/**
 * Runtime-first `version` plus distinct base (falls back to appVersion when host base unset).
 */
export function resolveDisplayedAppVersions(input: {
  runtimeVersion?: string | null
  hostBaseVersion?: string | null
  appVersion: string
}): { version: string; runtimeVersion: string; baseVersion: string } {
  const version = preferRuntimeAppVersion(input.runtimeVersion, input.appVersion)
  const baseRaw =
    (typeof input.hostBaseVersion === 'string' && input.hostBaseVersion.trim()
      ? input.hostBaseVersion.trim()
      : null) ?? input.appVersion
  const baseVersion = normalizeBaseVersionLabel(baseRaw) ?? input.appVersion
  return { version, runtimeVersion: version, baseVersion }
}

function runtimeIsDocker(env?: RuntimeCheckEnv): boolean {
  if (typeof env?.isDocker === 'boolean') return env.isDocker
  return isDockerEnv()
}

/**
 * Minimal range matcher for markers: `>=24 <25`, `>=24.0.0`, `24`.
 * No full npm semver — deliberately small.
 */
export function nodeVersionSatisfies(version: string, range: string): boolean {
  const ver = parseSemVer(version)
  if (!ver) return false
  const tokens = range.trim().split(/\s+/).filter(Boolean)
  if (tokens.length === 0) return true

  for (const token of tokens) {
    const m = /^(>=|>|<=|<|=)?(.+)$/.exec(token)
    if (!m) return false
    const op = m[1] ?? ''
    const targetRaw = m[2] ?? ''
    const target = parseSemVer(targetRaw)
    if (!target) return false

    // Bare major (e.g. `24`) without operator → match that major.
    if (!op && !targetRaw.includes('.')) {
      if (ver[0] !== target[0]) return false
      continue
    }

    const c = cmpSemVer(ver, target)
    switch (op) {
      case '':
      case '=':
        if (c !== 0) return false
        break
      case '>=':
        if (c < 0) return false
        break
      case '>':
        if (c <= 0) return false
        break
      case '<=':
        if (c > 0) return false
        break
      case '<':
        if (c >= 0) return false
        break
      default:
        return false
    }
  }
  return true
}

function normalizeNodeVersion(raw: string): string {
  return raw.trim().replace(/^v/i, '')
}

function platformKey(platform: string, arch: string): string {
  return `${platform}-${arch}`
}

function evaluateMinBaseImage(
  minBaseImage: string,
  env: RuntimeCheckEnv | undefined,
  reasons: string[],
): boolean {
  const hostBase = resolveHostBaseVersion(env)
  const docker = runtimeIsDocker(env)

  if (!hostBase) {
    if (docker || minBaseImage.trim()) {
      reasons.push('host base version unknown; base refresh required')
      return true
    }
    return false
  }

  const minVer = parseBaseImageVersion(minBaseImage)
  const hostVer = parseBaseImageVersion(hostBase)
  if (!minVer) return false
  if (!hostVer) {
    reasons.push(`host base ${hostBase} is not a comparable semver tag`)
    return docker
  }

  if (cmpSemVer(hostVer, minVer) < 0) {
    reasons.push(
      `host base ${hostBase} is below required minBaseImage ${minBaseImage}`,
    )
    return true
  }
  return false
}

/**
 * Check marker requires against env (defaults to current process).
 * - No requires → ok
 * - `requiresBaseRefresh` → needsBaseRefresh
 * - node / platform / minBaseImage mismatch → needsBaseRefresh
 */
export function evaluateRuntimeRequires(
  marker: RuntimeMarker | null | undefined,
  env?: RuntimeCheckEnv,
): RuntimeRequiresResult {
  const reasons: string[] = []
  const requires: RuntimeRequires | undefined = marker?.requires
  if (!requires || Object.keys(requires).length === 0) {
    return { ok: true, needsBaseRefresh: false, reasons }
  }

  const nodeVersion = normalizeNodeVersion(
    env?.nodeVersion ?? process.versions.node,
  )
  const platform = env?.platform ?? process.platform
  const arch = env?.arch ?? process.arch
  const key = platformKey(String(platform), String(arch))

  let needsBaseRefresh = false

  if (requires.requiresBaseRefresh === true) {
    needsBaseRefresh = true
    reasons.push('marker requires base refresh')
  }

  if (typeof requires.node === 'string' && requires.node.trim()) {
    const range = requires.node.trim()
    if (!nodeVersionSatisfies(nodeVersion, range)) {
      needsBaseRefresh = true
      reasons.push(
        `node ${nodeVersion} does not satisfy required range ${range}`,
      )
    }
  }

  if (Array.isArray(requires.platforms) && requires.platforms.length > 0) {
    const allowed = new Set(requires.platforms.map(p => p.trim()).filter(Boolean))
    if (!allowed.has(key)) {
      needsBaseRefresh = true
      reasons.push(
        `platform ${key} not in required platforms [${[...allowed].join(', ')}]`,
      )
    }
  }

  if (typeof requires.minBaseImage === 'string' && requires.minBaseImage.trim()) {
    if (evaluateMinBaseImage(requires.minBaseImage.trim(), env, reasons)) {
      needsBaseRefresh = true
    }
  }

  return {
    ok: !needsBaseRefresh,
    needsBaseRefresh,
    reasons,
  }
}
