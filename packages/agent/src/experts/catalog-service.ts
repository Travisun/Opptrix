import type {
  ExpertCatalog,
  ExpertCatalogEntry,
  ExpertCreateInput,
  ExpertDefinition,
  ExpertListQuery,
  ExpertPatchInput,
} from '@opptrix/shared'
import { getUserDataStore, LocalExpertsRepository } from '@opptrix/user-store'
import { sanitizeExpertPersona } from './prompt-assembler.js'
import { LocalJsonExpertProvider } from './local-json-provider.js'
import { StaticHttpExpertProvider } from './static-http-provider.js'

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

function matchesQuery(def: ExpertCatalogEntry, query?: ExpertListQuery): boolean {
  if (query?.tag && !def.tags.includes(query.tag)) return false
  const q = query?.q?.trim().toLowerCase()
  if (!q) return true
  const haystack = [def.title, def.summary, ...def.tags].join(' ').toLowerCase()
  return haystack.includes(q)
}

function listBuiltinEntries(provider: LocalJsonExpertProvider): ExpertCatalogEntry[] {
  return provider.listAllSync().map(toCatalogEntry)
}

function listPersonalEntries(repo: LocalExpertsRepository): ExpertCatalogEntry[] {
  return repo.listAll().map(toCatalogEntry)
}

function paginateEntries(
  all: ExpertCatalogEntry[],
  query: ExpertListQuery | undefined,
  source: ExpertCatalog['source'],
): ExpertCatalog {
  const limit = Math.min(Math.max(query?.limit ?? 50, 1), 100)
  const offset = query?.cursor ? Number.parseInt(query.cursor, 10) : 0
  const start = Number.isFinite(offset) && offset > 0 ? offset : 0
  const slice = all.slice(start, start + limit)
  const nextStart = start + slice.length
  return {
    experts: slice,
    source,
    fetchedAt: new Date().toISOString(),
    nextCursor: nextStart < all.length ? String(nextStart) : undefined,
  }
}

export class ExpertCatalogService {
  private readonly fallback: LocalJsonExpertProvider
  private readonly remote: StaticHttpExpertProvider
  private readonly localRepo: LocalExpertsRepository
  private readonly remoteDefCache = new Map<string, ExpertDefinition>()
  private remoteListCache: ExpertCatalogEntry[] | null = null

  constructor(options?: {
    fallback?: LocalJsonExpertProvider
    remote?: StaticHttpExpertProvider
  }) {
    this.fallback = options?.fallback ?? new LocalJsonExpertProvider()
    this.remote = options?.remote ?? new StaticHttpExpertProvider()
    this.localRepo = new LocalExpertsRepository(getUserDataStore())
  }

  async listExperts(query?: ExpertListQuery): Promise<ExpertCatalog> {
    const scope = query?.scope ?? 'all'
    let entries: ExpertCatalogEntry[] = []
    let source: ExpertCatalog['source'] = 'local'

    if (scope === 'public' || scope === 'all') {
      const remoteEntries = await this.tryFetchRemoteEntries()
      if (remoteEntries) {
        entries = entries.concat(remoteEntries)
        source = 'remote'
        this.cacheRemoteList(remoteEntries)
      } else {
        entries = entries.concat(listBuiltinEntries(this.fallback))
      }
    }
    if (scope === 'personal' || scope === 'all') {
      entries = entries.concat(listPersonalEntries(this.localRepo))
    }
    const filtered = entries.filter(entry => matchesQuery(entry, query))
    return paginateEntries(filtered, query, source)
  }

  async getDefinition(id: string): Promise<ExpertDefinition | null> {
    const trimmed = id.trim()
    if (!trimmed) return null

    const local = this.localRepo.get(trimmed)
    if (local) return local

    const cached = this.remoteDefCache.get(trimmed)
    if (cached) return cached

    try {
      const remote = await this.remote.getExpert(trimmed)
      if (remote) {
        this.remoteDefCache.set(trimmed, remote)
        return remote
      }
    } catch {
      // fall through to builtin fallback
    }

    const builtin = this.fallback.getExpertSync(trimmed)
    return builtin
  }

  getDefinitionSync(id: string): ExpertDefinition | null {
    const trimmed = id.trim()
    if (!trimmed) return null
    return this.localRepo.get(trimmed)
      ?? this.remoteDefCache.get(trimmed)
      ?? this.fallback.getExpertSync(trimmed)
  }

  createExpert(input: ExpertCreateInput): ExpertDefinition {
    const persona = sanitizeExpertPersona(input.persona)
    if (!persona) {
      throw new Error('角色设定无效，请修改后重试')
    }
    return this.localRepo.create(input, persona)
  }

  updateExpert(id: string, patch: ExpertPatchInput): ExpertDefinition {
    let persona: string | undefined
    if (patch.persona !== undefined) {
      const sanitized = sanitizeExpertPersona(patch.persona)
      if (!sanitized) {
        throw new Error('角色设定无效，请修改后重试')
      }
      persona = sanitized
    }
    return this.localRepo.save(id, patch, persona)
  }

  deleteExpert(id: string): boolean {
    if (this.fallback.getExpertSync(id)) return false
    if (this.remoteDefCache.has(id)) return false
    if (this.remoteListCache?.some(entry => entry.id === id)) return false
    return this.localRepo.delete(id)
  }

  resetCachesForTests(): void {
    this.remoteDefCache.clear()
    this.remoteListCache = null
  }

  private async tryFetchRemoteEntries(): Promise<ExpertCatalogEntry[] | null> {
    try {
      return await this.remote.fetchCatalogEntries()
    } catch {
      return null
    }
  }

  private cacheRemoteList(entries: ExpertCatalogEntry[]): void {
    this.remoteListCache = entries
  }
}

let singleton: ExpertCatalogService | null = null

export function getExpertCatalogService(): ExpertCatalogService {
  if (!singleton) singleton = new ExpertCatalogService()
  return singleton
}

export function resetExpertCatalogServiceForTests(): void {
  singleton?.resetCachesForTests()
  singleton = null
}
