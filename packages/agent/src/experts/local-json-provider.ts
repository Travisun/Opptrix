import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type {
  ExpertCatalog,
  ExpertCatalogEntry,
  ExpertDefinition,
  ExpertListQuery,
} from '@opptrix/shared'
import { DEFAULT_EXPERT_ICON } from '@opptrix/shared'

export interface RemoteExpertProvider {
  listExperts(query?: ExpertListQuery): Promise<ExpertCatalog>
  getExpert(id: string): Promise<ExpertDefinition | null>
}

interface MockCatalogFile {
  experts: ExpertDefinition[]
}

let cachedDefinitions: ExpertDefinition[] | null = null

function loadDefinitions(): ExpertDefinition[] {
  if (cachedDefinitions) return cachedDefinitions
  const path = fileURLToPath(new URL('./catalog.mock.json', import.meta.url))
  const raw = JSON.parse(readFileSync(path, 'utf8')) as MockCatalogFile
  cachedDefinitions = (raw.experts ?? []).map(def => ({
    ...def,
    icon: def.icon?.kind === 'icon' ? def.icon : DEFAULT_EXPERT_ICON,
    source: 'builtin' as const,
    official: def.official ?? true,
  }))
  return cachedDefinitions
}

function toCatalogEntry(def: ExpertDefinition): ExpertCatalogEntry {
  return {
    id: def.id,
    title: def.title,
    summary: def.summary,
    icon: def.icon,
    tags: def.tags,
    official: def.official,
    version: def.version,
    source: def.source,
  }
}

function matchesQuery(def: ExpertDefinition, query?: ExpertListQuery): boolean {
  if (query?.tag && !def.tags.includes(query.tag)) return false
  const q = query?.q?.trim().toLowerCase()
  if (!q) return true
  const haystack = [def.title, def.summary, ...def.tags].join(' ').toLowerCase()
  return haystack.includes(q)
}

export class LocalJsonExpertProvider implements RemoteExpertProvider {
  listAllSync(): ExpertDefinition[] {
    return loadDefinitions()
  }

  async listExperts(query?: ExpertListQuery): Promise<ExpertCatalog> {
    const all = loadDefinitions().filter(d => matchesQuery(d, query))
    const limit = Math.min(Math.max(query?.limit ?? 50, 1), 100)
    const offset = query?.cursor ? Number.parseInt(query.cursor, 10) : 0
    const start = Number.isFinite(offset) && offset > 0 ? offset : 0
    const slice = all.slice(start, start + limit)
    const nextStart = start + slice.length
    return {
      experts: slice.map(toCatalogEntry),
      source: 'local',
      fetchedAt: new Date().toISOString(),
      nextCursor: nextStart < all.length ? String(nextStart) : undefined,
    }
  }

  async getExpert(id: string): Promise<ExpertDefinition | null> {
    return this.getExpertSync(id)
  }

  getExpertSync(id: string): ExpertDefinition | null {
    const trimmed = id.trim()
    if (!trimmed) return null
    return loadDefinitions().find(d => d.id === trimmed) ?? null
  }
}

export function resetBuiltinExpertCacheForTests(): void {
  cachedDefinitions = null
}
