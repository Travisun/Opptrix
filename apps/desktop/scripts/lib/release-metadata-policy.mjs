/**
 * Single source of truth for desktop release / auto-update metadata.
 *
 * Invariants (do not break without updating CI + R2 + client docs):
 * - electron-updater generic feed files: latest-mac.yml, latest.yml, latest-linux.yml
 * - publish.channel is always "latest" (dev/beta/rc/stable share one CDN feed)
 * - detectUpdateChannel is false (0.6.0-dev.* would otherwise emit dev-*.yml)
 * - macOS artifact labels: ASCII + hyphens only (GitHub Release + yml must match exactly)
 * - macOS URLs must contain arm64 / x64 substrings for MacUpdater arch filter
 */
import path from 'node:path'

/** electron-updater channel baked into yml file names (latest-mac.yml, not dev-mac.yml). */
export const UPDATE_CHANNEL = 'latest'

/** Public CDN / R2 metadata consumed by packaged clients. */
export const UPDATE_YML_PUBLIC = Object.freeze([
  'latest-mac.yml',
  'latest.yml',
  'latest-linux.yml',
])

/** Per-arch macOS yml uploaded by matrix jobs before finalize merge. */
export const UPDATE_YML_MAC_PER_ARCH = Object.freeze([
  'latest-mac-arm64.yml',
  'latest-mac-x64.yml',
])

/** Allowed platform label segment (no spaces/parens — must match on disk and GitHub Release). */
export const SAFE_ARTIFACT_LABEL = /^[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*$/

/** Required macOS arch markers inside auto-update zip file names. */
export const MAC_UPDATE_ARCH_MARKERS = Object.freeze(['arm64', 'x64'])

export function buildGenericPublishConfig(feedUrl) {
  const url = feedUrl.endsWith('/') ? feedUrl : `${feedUrl}/`
  return {
    provider: 'generic',
    url,
    channel: UPDATE_CHANNEL,
  }
}

/** Patch applied to package.json build field during CI/local release builds. */
export function buildPublishPatch(feedUrl) {
  return {
    detectUpdateChannel: false,
    publish: [buildGenericPublishConfig(feedUrl)],
  }
}

export function assertSafeArtifactLabel(label, context = 'artifact label') {
  if (!SAFE_ARTIFACT_LABEL.test(label)) {
    throw new Error(
      `${context} "${label}" is unsafe: use only letters, digits, and hyphens `
        + '(spaces/parentheses break GitHub Release vs latest-*.yml alignment).',
    )
  }
}

export function validateMacArtifactLabelMap(labelMap) {
  for (const [arch, label] of Object.entries(labelMap)) {
    assertSafeArtifactLabel(label, `MAC_ARTIFACT_LABEL.${arch}`)
    const marker = arch === 'arm64' ? 'arm64' : 'x64'
    if (!label.includes(marker)) {
      throw new Error(`MAC_ARTIFACT_LABEL.${arch} must include "${marker}" for electron-updater`)
    }
  }
}

export function collectYmlReferencedBasenames(info) {
  const names = new Set()
  const entries = Array.isArray(info?.files) && info.files.length > 0
    ? info.files
    : info?.path
      ? [{ url: info.path }]
      : []

  for (const entry of entries) {
    if (entry?.url) names.add(path.basename(String(entry.url)))
  }
  if (info?.path) names.add(path.basename(String(info.path)))
  return names
}

export function assertYmlReferencesInAssetSet(ymlBasename, info, assets) {
  const refs = collectYmlReferencedBasenames(info)
  if (refs.size === 0) {
    throw new Error(`${ymlBasename}: no files/path entries`)
  }
  if (!info?.version) {
    throw new Error(`${ymlBasename}: missing version`)
  }

  for (const name of refs) {
    if (!assets.has(name)) {
      throw new Error(`${ymlBasename} references ${name}, not found in release assets`)
    }
    assertSafeArtifactBasename(name)
  }
}

export function assertSafeArtifactBasename(name) {
  if (name.endsWith('.yml')) return
  const base = path.basename(name)
  if (/[^A-Za-z0-9._-]/.test(base)) {
    throw new Error(
      `Unsafe release artifact name "${base}": use only letters, digits, dot, underscore, hyphen`,
    )
  }
}

export function assertMacMergedUpdateInfo(info) {
  const files = Array.isArray(info?.files) ? info.files : []
  for (const marker of MAC_UPDATE_ARCH_MARKERS) {
    const zip = files.find((f) => f?.url?.includes(marker) && String(f.url).endsWith('.zip'))
    if (!zip) {
      throw new Error(`latest-mac.yml must include a ${marker} .zip entry (MacUpdater arch filter)`)
    }
  }
}

export function parseTagVersion(tag) {
  const prefix = 'desktop-v'
  if (!tag.startsWith(prefix)) {
    throw new Error(`Expected tag desktop-v*, got ${tag}`)
  }
  return tag.slice(prefix.length)
}

/** Semver channel electron-builder would infer when detectUpdateChannel=true (we disable this). */
export function inferredPrereleaseChannel(version) {
  const dash = version.indexOf('-')
  if (dash === -1) return null
  const prerelease = version.slice(dash + 1)
  const channel = prerelease.split('.')[0]
  return channel || null
}
