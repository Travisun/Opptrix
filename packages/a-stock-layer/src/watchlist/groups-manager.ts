import { WatchlistGroupsStore } from './groups-store.js'
import type { WatchlistGroupsDocument } from './groups-models.js'

export class WatchlistGroupsManager {
  private store = WatchlistGroupsStore.getInstance()

  get(): WatchlistGroupsDocument {
    return this.store.load()
  }

  replace(doc: WatchlistGroupsDocument): WatchlistGroupsDocument {
    return this.store.replace(doc)
  }

  removeGroup(groupId: string): WatchlistGroupsDocument {
    return this.store.removeGroup(groupId)
  }

  removeItemMembership(itemKey: string): WatchlistGroupsDocument {
    return this.store.removeItemMembership(itemKey)
  }

  pruneMembership(validItemKeys: Iterable<string>): WatchlistGroupsDocument {
    return this.store.pruneMembership(validItemKeys)
  }
}
