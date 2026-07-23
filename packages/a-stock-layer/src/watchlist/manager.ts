import { WatchlistStore } from './store.js'
import { WatchlistGroupsManager } from './groups-manager.js'
import type { WatchlistItem } from './models.js'
import { watchlistItemKey } from './instrument.js'

export class WatchlistManager {
  private store = WatchlistStore.getInstance()
  private groupsManager = new WatchlistGroupsManager()

  get groups() {
    return this.groupsManager
  }

  list(): WatchlistItem[] {
    return this.store.list()
  }

  replace(items: WatchlistItem[]) {
    const saved = this.store.replace(items)
    const keys = saved.map(item => watchlistItemKey(item))
    this.groupsManager.pruneMembership(keys)
    return saved
  }

  codes(): string[] {
    return this.store.codes()
  }
}
