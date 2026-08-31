/**
 * Article-level news translation cache: in-memory LRU Map + debounced JSON persist.
 * Mirrors former Electron createTranslationCache; file lives under user data root.
 */
import fs from 'node:fs'
import path from 'node:path'
import { resolveUserDataRoot } from '@opptrix/shared'

export const DEFAULT_CACHE_FILE = path.join(resolveUserDataRoot(), 'news-translation-cache.json')
/** Cap live + disk entries (LRU). */
export const DEFAULT_MAX_ENTRIES = 2000
/** Align with market-data-core Cache debounce (1–2s). */
export const DEFAULT_PERSIST_DEBOUNCE_MS = 1500

export type TranslationCacheEntry = Record<string, unknown>

export type TranslationCacheOptions = {
  filePath?: string
  maxEntries?: number
  persistDebounceMs?: number
  disableExitFlush?: boolean
}

export type TranslationCache = {
  get: (cacheKey: string) => TranslationCacheEntry | null
  set: (cacheKey: string, value: TranslationCacheEntry) => void
  clear: () => void
  flush: () => void
  dispose: () => void
  readonly persistWriteCount: number
  readonly size: number
  readonly filePath: string
}

export function createTranslationCache(options: TranslationCacheOptions = {}): TranslationCache {
  const filePath = options.filePath ?? DEFAULT_CACHE_FILE
  const maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES
  const persistDebounceMs = options.persistDebounceMs ?? DEFAULT_PERSIST_DEBOUNCE_MS
  const disableExitFlush = options.disableExitFlush === true

  const store = new Map<string, TranslationCacheEntry>()
  let dirty = false
  let persistTimer: ReturnType<typeof setTimeout> | null = null
  let persistWriteCount = 0
  let onBeforeExit: (() => void) | null = null

  function load(): void {
    try {
      if (!fs.existsSync(filePath)) return
      const raw = fs.readFileSync(filePath, 'utf8')
      const parsed: unknown = JSON.parse(raw)
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return
      for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
        if (!value || typeof value !== 'object' || Array.isArray(value)) continue
        store.set(key, value as TranslationCacheEntry)
      }
      enforceLimits()
    } catch {
      /* fresh cache */
    }
  }

  function writeDisk(): void {
    try {
      const dir = path.dirname(filePath)
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
      const payload: Record<string, TranslationCacheEntry> = {}
      for (const [k, v] of store) {
        payload[k] = v
      }
      fs.writeFileSync(filePath, JSON.stringify(payload), 'utf8')
      persistWriteCount += 1
      dirty = false
    } catch {
      /* ignore disk errors; memory remains authoritative for this process */
    }
  }

  function schedulePersist(): void {
    dirty = true
    if (persistDebounceMs <= 0) {
      writeDisk()
      return
    }
    if (persistTimer) return
    persistTimer = setTimeout(() => {
      persistTimer = null
      if (dirty) writeDisk()
    }, persistDebounceMs)
    persistTimer.unref?.()
  }

  function flush(): void {
    if (persistTimer) {
      clearTimeout(persistTimer)
      persistTimer = null
    }
    if (dirty) writeDisk()
  }

  function flushNow(): void {
    dirty = true
    if (persistTimer) {
      clearTimeout(persistTimer)
      persistTimer = null
    }
    writeDisk()
  }

  function enforceLimits(): void {
    while (store.size > maxEntries) {
      const oldest = store.keys().next().value
      if (oldest === undefined) break
      store.delete(oldest)
    }
  }

  function touch(key: string, entry: TranslationCacheEntry): void {
    store.delete(key)
    store.set(key, entry)
  }

  function get(cacheKey: string): TranslationCacheEntry | null {
    const entry = store.get(cacheKey)
    if (!entry) return null
    touch(cacheKey, entry)
    return entry
  }

  function set(cacheKey: string, value: TranslationCacheEntry): void {
    const entry: TranslationCacheEntry = {
      ...value,
      cached_at: new Date().toISOString(),
    }
    if (store.has(cacheKey)) store.delete(cacheKey)
    store.set(cacheKey, entry)
    enforceLimits()
    schedulePersist()
  }

  function clear(): void {
    store.clear()
    flushNow()
  }

  function dispose(): void {
    if (persistTimer) {
      clearTimeout(persistTimer)
      persistTimer = null
    }
    if (onBeforeExit) {
      process.off('beforeExit', onBeforeExit)
      onBeforeExit = null
    }
  }

  load()

  if (!disableExitFlush && typeof process !== 'undefined' && typeof process.on === 'function') {
    onBeforeExit = () => {
      flush()
    }
    process.on('beforeExit', onBeforeExit)
  }

  return {
    get,
    set,
    clear,
    flush,
    dispose,
    get persistWriteCount() {
      return persistWriteCount
    },
    get size() {
      return store.size
    },
    get filePath() {
      return filePath
    },
  }
}

let defaultCache: TranslationCache | null = null

function getDefaultCache(): TranslationCache {
  if (!defaultCache) {
    defaultCache = createTranslationCache()
  }
  return defaultCache
}

/** `${articleId}::${modelBasename}::zh` */
export function buildArticleTranslationCacheKey(articleId: string, modelBasename: string): string {
  return `${articleId}::${modelBasename}::zh`
}

export function getCachedTranslation(cacheKey: string): TranslationCacheEntry | null {
  return getDefaultCache().get(cacheKey)
}

export function setCachedTranslation(cacheKey: string, value: TranslationCacheEntry): void {
  getDefaultCache().set(cacheKey, value)
}

export function clearCachedTranslations(): void {
  getDefaultCache().clear()
}

export function flushTranslationCache(): void {
  getDefaultCache().flush()
}

export function disposeTranslationCache(): void {
  if (!defaultCache) return
  defaultCache.dispose()
  defaultCache = null
}

/** Test helper: replace default cache (e.g. temp filePath). */
export function setDefaultTranslationCacheForTests(cache: TranslationCache | null): void {
  if (defaultCache) defaultCache.dispose()
  defaultCache = cache
}
