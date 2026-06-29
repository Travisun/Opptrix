import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { WatchlistItem } from './models.js'

const DB_DIR = path.join(os.homedir(), '.a_stock_layer')
const DB_FILE = path.join(DB_DIR, 'watchlist.json')

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
    fs.mkdirSync(DB_DIR, { recursive: true })
    this.items = this.load()
  }

  static getInstance() {
    if (!WatchlistStore.inst) WatchlistStore.inst = new WatchlistStore()
    return WatchlistStore.inst
  }

  private load(): WatchlistItem[] {
    try {
      if (fs.existsSync(DB_FILE)) {
        const raw = JSON.parse(fs.readFileSync(DB_FILE, 'utf8')) as { items?: WatchlistItem[] }
        if (Array.isArray(raw.items)) {
          return raw.items.map(normalizeItem)
        }
      }
    } catch { /* reset */ }
    return []
  }

  private save() {
    fs.writeFileSync(DB_FILE, JSON.stringify({ items: this.items }, null, 2))
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
