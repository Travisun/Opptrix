import { getUserDataStore } from '@opptrix/user-store'
import type { WatchlistItem } from './models.js'

const NAMESPACE = 'watchlist'
const DOC_ID = 'default'

function normalizeCode(code: string) {
  return code.replace(/\D/g, '').padStart(6, '0').slice(-6)
}

function normalizeItem(item: WatchlistItem): WatchlistItem {
  return {
    code: normalizeCode(item.code),
    name: item.name?.trim() || item.code,
    industry: item.industry?.trim() || undefined,
    note: item.note?.trim() || undefined,
    addedAt: item.addedAt,
    addedPrice: item.addedPrice ?? null,
  }
}

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
        return raw.items.map(normalizeItem)
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
      .map(normalizeItem)
      .filter(item => {
        if (seen.has(item.code)) return false
        seen.add(item.code)
        return true
      })
    this.save()
    return this.items
  }

  codes(): string[] {
    return this.items.map(i => i.code)
  }
}
