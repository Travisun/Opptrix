import { getUserDataStore } from '@opptrix/user-store'
import type { WatchlistItem } from './models.js'
import { normalizeWatchlistItem, watchlistItemKey } from './instrument.js'

const NAMESPACE = 'watchlist'
const DOC_ID = 'default'

export class WatchlistStore {
  private static inst: WatchlistStore | null = null
  private items: WatchlistItem[] = []

  private constructor() {
    this.items = this.load()
  }

  static getInstance() {
    if (!WatchlistStore.inst) WatchlistStore.inst = new WatchlistStore()
    return WatchlistStore.inst
  }

  private load(): WatchlistItem[] {
    try {
      const raw = getUserDataStore().getDocument<{ items?: WatchlistItem[] }>(NAMESPACE, DOC_ID)
      if (Array.isArray(raw?.items)) {
        return raw.items.map(normalizeWatchlistItem)
      }
    } catch { /* reset */ }
    return []
  }

  private save() {
    getUserDataStore().setDocument(NAMESPACE, DOC_ID, { items: this.items })
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
