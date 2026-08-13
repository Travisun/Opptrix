const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const DEFAULT_CACHE_FILE = path.join(os.homedir(), '.opptrix', 'news-translation-cache.json')
/** Cap live + disk entries (LRU). Raised from 200 to bound growth without thrashing. */
const DEFAULT_MAX_ENTRIES = 2000
/** Align with market-data-core Cache debounce (1–2s). */
const DEFAULT_PERSIST_DEBOUNCE_MS = 1500

/**
 * In-memory LRU Map + debounced JSON persist (same idea as engine Cache).
 *
 * Eviction: Map insertion order = LRU. get() touches; set() re-inserts.
 * Evicted keys are gone from memory and omitted on next persist — not readable
 * until re-translated. Restart loads only what last flushed to disk.
 *
 * @param {{
 *   filePath?: string
 *   maxEntries?: number
 *   persistDebounceMs?: number
 *   disableExitFlush?: boolean
 * }} [options]
 */
function createTranslationCache(options = {}) {
  const filePath = options.filePath ?? DEFAULT_CACHE_FILE
  const maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES
  const persistDebounceMs = options.persistDebounceMs ?? DEFAULT_PERSIST_DEBOUNCE_MS
  const disableExitFlush = options.disableExitFlush === true

  /** @type {Map<string, Record<string, unknown>>} */
  const store = new Map()
  let dirty = false
  /** @type {ReturnType<typeof setTimeout> | null} */
  let persistTimer = null
  let persistWriteCount = 0
  /** @type {(() => void) | null} */
  let onBeforeExit = null

  function load() {
    try {
      if (!fs.existsSync(filePath)) return
      const raw = fs.readFileSync(filePath, 'utf8')
      const parsed = JSON.parse(raw)
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return
      for (const [key, value] of Object.entries(parsed)) {
        if (!value || typeof value !== 'object' || Array.isArray(value)) continue
        store.set(key, /** @type {Record<string, unknown>} */ (value))
      }
      enforceLimits()
    } catch {
      /* fresh cache */
    }
  }

  function writeDisk() {
    try {
      const dir = path.dirname(filePath)
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
      /** @type {Record<string, Record<string, unknown>>} */
      const payload = {}
      for (const [k, v] of store) {
        payload[k] = v
      }
      // Compact JSON (no indent) — smaller + faster than pretty-print.
      fs.writeFileSync(filePath, JSON.stringify(payload), 'utf8')
      persistWriteCount += 1
      dirty = false
    } catch {
      /* ignore disk errors; memory remains authoritative for this process */
    }
  }

  function schedulePersist() {
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
    // Do not keep the process alive solely for cache flush; beforeExit still flushes.
    persistTimer.unref?.()
  }

  function flush() {
    if (persistTimer) {
      clearTimeout(persistTimer)
      persistTimer = null
    }
    if (dirty) writeDisk()
  }

  function flushNow() {
    dirty = true
    if (persistTimer) {
      clearTimeout(persistTimer)
      persistTimer = null
    }
    writeDisk()
  }

  function enforceLimits() {
    while (store.size > maxEntries) {
      const oldest = store.keys().next().value
      if (oldest === undefined) break
      store.delete(oldest)
    }
  }

  /** Move key to most-recently-used (Map insertion order). */
  function touch(key, entry) {
    store.delete(key)
    store.set(key, entry)
  }

  /**
   * @param {string} cacheKey
   * @returns {Record<string, unknown> | null}
   */
  function get(cacheKey) {
    const entry = store.get(cacheKey)
    if (!entry) return null
    touch(cacheKey, entry)
    return entry
  }

  /**
   * @param {string} cacheKey
   * @param {Record<string, unknown>} value
   */
  function set(cacheKey, value) {
    const entry = {
      ...value,
      cached_at: new Date().toISOString(),
    }
    if (store.has(cacheKey)) store.delete(cacheKey)
    store.set(cacheKey, entry)
    enforceLimits()
    schedulePersist()
  }

  /** Clear all entries and persist immediately (empty object on disk). */
  function clear() {
    store.clear()
    flushNow()
  }

  function dispose() {
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

/** @type {ReturnType<typeof createTranslationCache> | null} */
let defaultCache = null

function getDefaultCache() {
  if (!defaultCache) {
    defaultCache = createTranslationCache()
  }
  return defaultCache
}

function getCachedTranslation(cacheKey) {
  return getDefaultCache().get(cacheKey)
}

function setCachedTranslation(cacheKey, value) {
  getDefaultCache().set(cacheKey, value)
}

function clearCachedTranslations() {
  getDefaultCache().clear()
}

function flushTranslationCache() {
  getDefaultCache().flush()
}

function disposeTranslationCache() {
  if (!defaultCache) return
  defaultCache.dispose()
  defaultCache = null
}

module.exports = {
  createTranslationCache,
  getCachedTranslation,
  setCachedTranslation,
  clearCachedTranslations,
  flushTranslationCache,
  disposeTranslationCache,
  DEFAULT_CACHE_FILE,
  DEFAULT_MAX_ENTRIES,
  DEFAULT_PERSIST_DEBOUNCE_MS,
}
