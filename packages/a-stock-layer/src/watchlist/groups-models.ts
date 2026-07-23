export interface WatchlistGroup {
  id: string
  title: string
  sortOrder: number
  createdAt?: string
}

export interface WatchlistGroupsDocument {
  groups: WatchlistGroup[]
  membership: Record<string, string[]>
}

export const WATCHLIST_ALL_GROUP_ID = '__all__'

export function emptyWatchlistGroupsDocument(): WatchlistGroupsDocument {
  return { groups: [], membership: {} }
}
