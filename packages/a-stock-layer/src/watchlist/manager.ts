import { WatchlistStore } from './store.js'
import type { WatchlistItem } from './models.js'

export class WatchlistManager {
  private store = WatchlistStore.getInstance()

  list(): WatchlistItem[] {
    return this.store.list()
  }

  replace(items: WatchlistItem[]) {
    return this.store.replace(items)
  }

  codes(): string[] {
    return this.store.codes()
  }
}
