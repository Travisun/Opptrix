/**
 * Normalize user-facing version strings for base (Docker) vs runtime (hot-update).
 */
import { APP_TAG_PREFIX, parseAppTag, parseSemver } from './app-refs.mjs'

/**
 * @param {string} raw
 * @returns {string | null} opptrix-selfhost-vX.Y.Z
 */
export function normalizeBaseTag(raw) {
  const input = String(raw ?? '').trim()
  if (!input) return null
  if (input === 'latest') return null
  const fromTag = parseAppTag(input)
  if (fromTag) return fromTag.tag
  const semver = input.replace(/^v/i, '')
  if (parseSemver(semver)) return `${APP_TAG_PREFIX}${semver}`
  return null
}

/**
 * @param {string} raw
 * @returns {string | null} X.Y.Z semver
 */
export function normalizeRuntimeVersion(raw) {
  const input = String(raw ?? '').trim()
  if (!input || input === 'latest') return null
  const v = input.replace(/^v/i, '')
  return parseSemver(v) ? v : null
}

/**
 * @param {string} tag
 * @returns {string}
 */
export function baseTagToDisplayVersion(tag) {
  return parseAppTag(tag)?.version ?? tag
}
