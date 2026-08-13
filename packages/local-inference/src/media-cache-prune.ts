import fs from 'node:fs'
import path from 'node:path'
import { getMediaCacheDir } from './paths.js'

/** 默认保留 7 天 */
export const DEFAULT_MEDIA_CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

/** 默认容量上限 2 GiB */
export const DEFAULT_MEDIA_CACHE_MAX_BYTES = 2 * 1024 * 1024 * 1024

export type PruneMediaCacheOptions = {
  cacheDir?: string
  maxAgeMs?: number
  maxBytes?: number
  /** 可注入时钟（测试） */
  nowMs?: number
}

export type PruneMediaCacheResult = {
  removedFiles: number
  freedBytes: number
  remainingFiles: number
  remainingBytes: number
}

type CacheFile = {
  path: string
  mtimeMs: number
  size: number
}

async function listCacheFiles(dir: string): Promise<CacheFile[]> {
  let names: string[]
  try {
    names = await fs.promises.readdir(dir)
  } catch (err) {
    const code = err && typeof err === 'object' && 'code' in err ? (err as { code?: string }).code : undefined
    if (code === 'ENOENT') return []
    throw err
  }

  const out: CacheFile[] = []
  for (const name of names) {
    if (name.startsWith('.')) continue
    const full = path.join(dir, name)
    try {
      const st = await fs.promises.stat(full)
      if (!st.isFile()) continue
      out.push({ path: full, mtimeMs: st.mtimeMs, size: st.size })
    } catch {
      /* skip unreadable */
    }
  }
  return out
}

/**
 * 清理 ~/.opptrix/media-cache：先按 TTL 删过期文件，再按容量从旧到新删直到低于上限。
 */
export async function pruneMediaCache(opts: PruneMediaCacheOptions = {}): Promise<PruneMediaCacheResult> {
  const cacheDir = opts.cacheDir ?? getMediaCacheDir()
  const maxAgeMs = opts.maxAgeMs ?? DEFAULT_MEDIA_CACHE_MAX_AGE_MS
  const maxBytes = opts.maxBytes ?? DEFAULT_MEDIA_CACHE_MAX_BYTES
  const now = opts.nowMs ?? Date.now()

  let files = await listCacheFiles(cacheDir)
  let removedFiles = 0
  let freedBytes = 0

  const keep: CacheFile[] = []
  for (const f of files) {
    if (maxAgeMs > 0 && now - f.mtimeMs > maxAgeMs) {
      try {
        await fs.promises.unlink(f.path)
        removedFiles += 1
        freedBytes += f.size
      } catch {
        keep.push(f)
      }
    } else {
      keep.push(f)
    }
  }
  files = keep

  let totalBytes = files.reduce((sum, f) => sum + f.size, 0)
  if (maxBytes > 0 && totalBytes > maxBytes) {
    files.sort((a, b) => a.mtimeMs - b.mtimeMs || a.path.localeCompare(b.path))
    for (const f of files) {
      if (totalBytes <= maxBytes) break
      try {
        await fs.promises.unlink(f.path)
        removedFiles += 1
        freedBytes += f.size
        totalBytes -= f.size
      } catch {
        /* keep counting as remaining */
      }
    }
  }

  const remaining = await listCacheFiles(cacheDir)
  return {
    removedFiles,
    freedBytes,
    remainingFiles: remaining.length,
    remainingBytes: remaining.reduce((sum, f) => sum + f.size, 0),
  }
}
