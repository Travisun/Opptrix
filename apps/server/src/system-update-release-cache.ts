/**
 * In-memory cache for release notes shown in system-update status API.
 */
import type { HotReleaseDescription } from './system-update-channel.js'

interface CachedReleaseDescription {
  version: string
  description: HotReleaseDescription
}

let cached: CachedReleaseDescription | null = null

export function setAvailableReleaseDescription(
  version: string | null | undefined,
  description: HotReleaseDescription | null | undefined,
): void {
  const v = String(version ?? '').trim().replace(/^v/i, '')
  if (!v || !description) {
    cached = null
    return
  }
  cached = {
    version: v,
    description: {
      features: Array.isArray(description.features) ? description.features.filter(Boolean) : [],
      fixes: Array.isArray(description.fixes) ? description.fixes.filter(Boolean) : [],
    },
  }
}

export function getAvailableReleaseDescription(
  version: string | null | undefined,
): HotReleaseDescription | null {
  const v = String(version ?? '').trim().replace(/^v/i, '')
  if (!v || !cached || cached.version !== v) return null
  return cached.description
}

export function clearAvailableReleaseDescriptionCache(): void {
  cached = null
}
