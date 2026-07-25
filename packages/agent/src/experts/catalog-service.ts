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
import { LocalJsonExpertProvider, type RemoteExpertProvider } from './local-json-provider.js'

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
  query?: ExpertListQuery,
): ExpertCatalog {
  const limit = Math.min(Math.max(query?.limit ?? 50, 1), 100)
  const offset = query?.cursor ? Number.parseInt(query.cursor, 10) : 0
  const start = Number.isFinite(offset) && offset > 0 ? offset : 0
  const slice = all.slice(start, start + limit)
  const nextStart = start + slice.length
  return {
    experts: slice,
    source: 'local',
    fetchedAt: new Date().toISOString(),
    nextCursor: nextStart < all.length ? String(nextStart) : undefined,
  }
}

export class ExpertCatalogService {
  private readonly builtin: LocalJsonExpertProvider
  private readonly localRepo: LocalExpertsRepository

  constructor(builtin: RemoteExpertProvider = new LocalJsonExpertProvider()) {
    if (!(builtin instanceof LocalJsonExpertProvider)) {
      throw new Error('ExpertCatalogService 一期仅支持 LocalJsonExpertProvider 作为内置源')
    }
    this.builtin = builtin
    this.localRepo = new LocalExpertsRepository(getUserDataStore())
  }

  listExperts(query?: ExpertListQuery): Promise<ExpertCatalog> {
    const scope = query?.scope ?? 'all'
    let entries: ExpertCatalogEntry[] = []
    if (scope === 'public' || scope === 'all') {
      entries = entries.concat(listBuiltinEntries(this.builtin))
    }
    if (scope === 'personal' || scope === 'all') {
      entries = entries.concat(listPersonalEntries(this.localRepo))
    }
    const filtered = entries.filter(entry => matchesQuery(entry, query))
    return Promise.resolve(paginateEntries(filtered, query))
  }

  getDefinition(id: string): Promise<ExpertDefinition | null> {
    return Promise.resolve(this.getDefinitionSync(id))
  }

  getDefinitionSync(id: string): ExpertDefinition | null {
    const trimmed = id.trim()
    if (!trimmed) return null
    return this.localRepo.get(trimmed) ?? this.builtin.getExpertSync(trimmed)
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
    const builtin = this.builtin.getExpertSync(id)
    if (builtin) return false
    return this.localRepo.delete(id)
  }
}

let singleton: ExpertCatalogService | null = null

export function getExpertCatalogService(): ExpertCatalogService {
  if (!singleton) singleton = new ExpertCatalogService()
  return singleton
}

export function resetExpertCatalogServiceForTests(): void {
  singleton = null
}
