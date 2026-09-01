/**
 * Helpers for release attachment / manifest filenames (download not implemented here).
 */

/** Canonical runtime archive basename for a version (gzip). */
export function runtimeArchiveFilename(version: string, ext: 'tar.gz' | 'tar.zst' = 'tar.gz'): string {
  const v = version.trim().replace(/^v/, '')
  if (!v) throw new Error('version required')
  return `opptrix-runtime-v${v}.${ext}`
}

/** Sidecar next to the archive. */
export function runtimeSha256Filename(version: string, ext: 'tar.gz' | 'tar.zst' = 'tar.gz'): string {
  return `${runtimeArchiveFilename(version, ext)}.sha256`
}

/** Optional JSON manifest name published alongside release assets. */
export function runtimeManifestFilename(version: string): string {
  const v = version.trim().replace(/^v/, '')
  if (!v) throw new Error('version required')
  return `opptrix-runtime-v${v}.manifest.json`
}

export interface RuntimeReleaseManifest {
  version: string
  artifacts: Array<{
    name: string
    sha256: string
    size?: number
  }>
  publishedAt?: string
  channel?: string
}

export function parseRuntimeManifest(raw: unknown): RuntimeReleaseManifest {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new Error('invalid runtime manifest')
  }
  const obj = raw as Record<string, unknown>
  if (typeof obj.version !== 'string' || !obj.version.trim()) {
    throw new Error('manifest.version required')
  }
  if (!Array.isArray(obj.artifacts)) {
    throw new Error('manifest.artifacts required')
  }
  const artifacts: RuntimeReleaseManifest['artifacts'] = []
  for (const item of obj.artifacts) {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) {
      throw new Error('invalid manifest artifact')
    }
    const row = item as Record<string, unknown>
    if (typeof row.name !== 'string' || typeof row.sha256 !== 'string') {
      throw new Error('artifact name/sha256 required')
    }
    artifacts.push({
      name: row.name,
      sha256: row.sha256.toLowerCase(),
      size: typeof row.size === 'number' ? row.size : undefined,
    })
  }
  return {
    version: obj.version.trim(),
    artifacts,
    publishedAt: typeof obj.publishedAt === 'string' ? obj.publishedAt : undefined,
    channel: typeof obj.channel === 'string' ? obj.channel : undefined,
  }
}
