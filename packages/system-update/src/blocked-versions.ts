/**
 * Track versions that failed apply/first-boot so update checks skip re-offer.
 */
import { compareSemver } from './semver.js'
import { patchState, readState, type SystemUpdateState } from './state.js'

export function isVersionBlocked(
  state: SystemUpdateState,
  version: string,
): boolean {
  const blocked = state.blockedVersions ?? []
  return blocked.some((v) => v === version.trim())
}

/** True when CDN latest should be downloaded (newer than current and all blocked). */
export function shouldOfferLatestVersion(
  state: SystemUpdateState,
  latestVersion: string,
  currentVersion: string,
): boolean {
  if (compareSemver(latestVersion, currentVersion) <= 0) return false
  if (isVersionBlocked(state, latestVersion)) return false
  const blocked = state.blockedVersions ?? []
  for (const b of blocked) {
    if (compareSemver(latestVersion, b) <= 0) return false
  }
  return true
}

export function blockVersion(
  version: string,
  reason?: string | null,
  systemDir?: string,
): SystemUpdateState {
  const v = version.trim()
  const state = readState(systemDir)
  const prev = state.blockedVersions ?? []
  const blocked = prev.includes(v) ? prev : [...prev, v]
  const clearsPending = state.pendingVersion === v
  return patchState(
    {
      blockedVersions: blocked,
      lastBlockedReason: reason ?? state.lastBlockedReason ?? null,
      ...(clearsPending
        ? { pendingVersion: null, uiPhase: 'normal' as const }
        : {}),
    },
    systemDir,
  )
}

/** Remove blocked entries with semver <= `version`. */
export function clearBlockedUpTo(
  version: string,
  systemDir?: string,
): SystemUpdateState {
  const state = readState(systemDir)
  const blocked = (state.blockedVersions ?? []).filter(
    (v) => compareSemver(v, version) > 0,
  )
  return patchState(
    {
      blockedVersions: blocked.length > 0 ? blocked : undefined,
      lastBlockedReason: blocked.length > 0 ? state.lastBlockedReason : null,
    },
    systemDir,
  )
}
