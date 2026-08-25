import { getUserDataStore } from '@opptrix/user-store'
import type { WatchlistItem } from './models.js'
import { normalizeWatchlistItem, watchlistItemKey } from './instrument.js'
import {
  INSTRUMENT_ID_UNIFY_WATCHLIST_V1,
  migrateWatchlistItemsInstrumentIdV1,
} from './migrate-instrument-id.js'

const NAMESPACE = 'watchlist'
const DOC_ID = 'default'
/** Merge rapid replace() calls into one SQLite write. */
const SAVE_DEBOUNCE_MS = 200

export class WatchlistStore {
  private static inst: WatchlistStore | null = null
  private items: WatchlistItem[] = []
  private dirty = false
  private saveTimer: ReturnType<typeof setTimeout> | null = null
  private onBeforeExit: (() => void) | null = null

  private constructor() {
    this.items = this.load()
    if (typeof process !== 'undefined' && typeof process.on === 'function') {
      this.onBeforeExit = () => {
        this.flush()
      }
      process.on('beforeExit', this.onBeforeExit)
      // SIGTERM (tests stopProcess / graceful shutdown) does not emit beforeExit.
      process.on('SIGTERM', this.onBeforeExit)
      process.on('SIGINT', this.onBeforeExit)
    }
  }

  static getInstance() {
    if (!WatchlistStore.inst) WatchlistStore.inst = new WatchlistStore()
    return WatchlistStore.inst
  }

  private load(): WatchlistItem[] {
    try {
      const store = getUserDataStore()
      const raw = store.getDocument<{ items?: WatchlistItem[] }>(NAMESPACE, DOC_ID)
      if (!Array.isArray(raw?.items)) return []

      let items = raw.items.map(normalizeWatchlistItem)

      if (!store.getMetaFlag(INSTRUMENT_ID_UNIFY_WATCHLIST_V1)) {
        try {
          const migrated = migrateWatchlistItemsInstrumentIdV1(items).map(normalizeWatchlistItem)
          items = migrated
          store.setDocument(NAMESPACE, DOC_ID, { items })
          store.setMetaFlag(INSTRUMENT_ID_UNIFY_WATCHLIST_V1)
        } catch (err) {
          // 失败保留原数据，不写 flag，下次启动可重试
          console.warn(
            '[watchlist] instrument_id_unify_watchlist_v1 failed; keeping original items:',
            err instanceof Error ? err.message : String(err),
          )
        }
      }

      return items
    } catch { /* reset */ }
    return []
  }

  /**
   * Schedule a debounced SQLite write. Memory (`items` / `list`) is already up to date.
   *
   * Crash window: if the process dies before `flush()` or the debounce timer fires
   * (~200ms), the last in-memory replace may not be on disk. Exit handlers call `flush()`.
   */
  private save() {
    this.dirty = true
    if (this.saveTimer) return
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null
      this.writeDisk()
    }, SAVE_DEBOUNCE_MS)
    this.saveTimer.unref?.()
  }

  private writeDisk() {
    if (!this.dirty) return
    getUserDataStore().setDocument(NAMESPACE, DOC_ID, { items: this.items })
    this.dirty = false
  }

  /**
   * Persist any pending save immediately (process exit / tests).
   * Cancels the debounce timer so only one write runs.
   */
  flush() {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer)
      this.saveTimer = null
    }
    if (this.dirty) this.writeDisk()
  }

  /** Drop exit hook + pending timer without writing (tests). Clears singleton. */
  dispose() {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer)
      this.saveTimer = null
    }
    if (this.onBeforeExit) {
      process.off('beforeExit', this.onBeforeExit)
      process.off('SIGTERM', this.onBeforeExit)
      process.off('SIGINT', this.onBeforeExit)
      this.onBeforeExit = null
    }
    if (WatchlistStore.inst === this) WatchlistStore.inst = null
  }

  /** Recreate after `OPPTRIX_DATA_DIR` swap in tests. */
  static resetForTests() {
    WatchlistStore.inst?.dispose()
    WatchlistStore.inst = null
  }

  list(): WatchlistItem[] {
    return [...this.items]
  }

  replace(items: WatchlistItem[]) {
    const seen = new Set<string>()
    this.items = items
      .map(normalizeWatchlistItem)
      .filter(item => {
        const key = watchlistItemKey(item)
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
    this.save()
    return this.items
  }

  codes(): string[] {
    return this.items.map(i => i.code)
  }
}
