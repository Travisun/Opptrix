import { getUserDataStore } from '@opptrix/user-store'
import type { WatchlistGroup, WatchlistGroupsDocument } from './groups-models.js'
import { emptyWatchlistGroupsDocument } from './groups-models.js'

const NAMESPACE = 'preference'
const DOC_ID = 'watchlist_groups'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseGroup(raw: unknown): WatchlistGroup | null {
  if (!isRecord(raw)) return null
  const id = typeof raw.id === 'string' ? raw.id.trim() : ''
  const title = typeof raw.title === 'string' ? raw.title.trim() : ''
  const sortOrder = typeof raw.sortOrder === 'number' && Number.isFinite(raw.sortOrder)
    ? raw.sortOrder
    : 0
  if (!id || !title) return null
  const createdAt = typeof raw.createdAt === 'string' ? raw.createdAt : undefined
  return { id, title, sortOrder, createdAt }
}

function parseMembership(raw: unknown): Record<string, string[]> {
  if (!isRecord(raw)) return {}
  const out: Record<string, string[]> = {}
  for (const [key, value] of Object.entries(raw)) {
    const itemKey = key.trim()
    if (!itemKey || !Array.isArray(value)) continue
    const groupIds = value
      .filter((id): id is string => typeof id === 'string')
      .map(id => id.trim())
      .filter(Boolean)
    if (groupIds.length) out[itemKey] = [...new Set(groupIds)]
  }
  return out
}

export function normalizeWatchlistGroupsDocument(raw: unknown): WatchlistGroupsDocument {
  if (!isRecord(raw)) return emptyWatchlistGroupsDocument()

  const seenIds = new Set<string>()
  const groups: WatchlistGroup[] = []
  if (Array.isArray(raw.groups)) {
    for (const entry of raw.groups) {
      const group = parseGroup(entry)
      if (!group || seenIds.has(group.id)) continue
      seenIds.add(group.id)
      groups.push(group)
    }
  }
  groups.sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title, 'zh-CN'))

  const membership = parseMembership(raw.membership)
  const validGroupIds = new Set(groups.map(g => g.id))
  const normalizedMembership: Record<string, string[]> = {}
  for (const [itemKey, groupIds] of Object.entries(membership)) {
    const filtered = groupIds.filter(id => validGroupIds.has(id))
    if (filtered.length) normalizedMembership[itemKey] = filtered
  }

  return { groups, membership: normalizedMembership }
}

export class WatchlistGroupsStore {
  private static inst: WatchlistGroupsStore | null = null

  static getInstance() {
    if (!WatchlistGroupsStore.inst) WatchlistGroupsStore.inst = new WatchlistGroupsStore()
    return WatchlistGroupsStore.inst
  }

  load(): WatchlistGroupsDocument {
    try {
      const raw = getUserDataStore().getDocument<unknown>(NAMESPACE, DOC_ID)
      return normalizeWatchlistGroupsDocument(raw)
    } catch {
      return emptyWatchlistGroupsDocument()
    }
  }

  save(doc: WatchlistGroupsDocument): WatchlistGroupsDocument {
    const normalized = normalizeWatchlistGroupsDocument(doc)
    getUserDataStore().setDocument(NAMESPACE, DOC_ID, normalized)
    return normalized
  }

  replace(doc: WatchlistGroupsDocument): WatchlistGroupsDocument {
    return this.save(doc)
  }

  removeGroup(groupId: string): WatchlistGroupsDocument {
    const current = this.load()
    const nextGroups = current.groups.filter(g => g.id !== groupId)
    const nextMembership: Record<string, string[]> = {}
    for (const [itemKey, groupIds] of Object.entries(current.membership)) {
      const filtered = groupIds.filter(id => id !== groupId)
      if (filtered.length) nextMembership[itemKey] = filtered
    }
    return this.save({ groups: nextGroups, membership: nextMembership })
  }

  removeItemMembership(itemKey: string): WatchlistGroupsDocument {
    const current = this.load()
    if (!(itemKey in current.membership)) return current
    const nextMembership = { ...current.membership }
    delete nextMembership[itemKey]
    return this.save({ groups: current.groups, membership: nextMembership })
  }

  pruneMembership(validItemKeys: Iterable<string>): WatchlistGroupsDocument {
    const valid = new Set(validItemKeys)
    const current = this.load()
    const nextMembership: Record<string, string[]> = {}
    for (const [itemKey, groupIds] of Object.entries(current.membership)) {
      if (valid.has(itemKey)) nextMembership[itemKey] = groupIds
    }
    if (Object.keys(nextMembership).length === Object.keys(current.membership).length) {
      return current
    }
    return this.save({ groups: current.groups, membership: nextMembership })
  }
}
