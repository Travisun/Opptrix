import type {
  ExpertCatalog,
  ExpertCatalogEntry,
  ExpertDefinition,
  ExpertListQuery,
} from '@opptrix/shared'
import {
  DEFAULT_EXPERT_ICON,
  EXPERT_COMPLIANCE_VERSION,
  isValidExpertId,
  normalizeExpertStarterPrompts,
} from '@opptrix/shared'
import { sanitizeExpertPersona } from './prompt-assembler.js'
import type { RemoteExpertProvider } from './local-json-provider.js'

export const DEFAULT_EXPERT_CATALOG_BASE_URL = 'https://update.opptrix.org/experts'

const FETCH_TIMEOUT_MS = 8_000
const CACHE_TTL_MS = 10 * 60 * 1000

interface CacheEntry<T> {
  value: T
  expiresAt: number
}

let catalogCache: CacheEntry<ExpertCatalogEntry[]> | null = null
const expertCache = new Map<string, CacheEntry<ExpertDefinition>>()

function resolveBaseUrl(): string {
  const raw = process.env.OPPTRIX_EXPERT_CATALOG_BASE_URL?.trim()
  const base = raw || DEFAULT_EXPERT_CATALOG_BASE_URL
  return base.replace(/\/+$/, '')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseIcon(raw: unknown): ExpertDefinition['icon'] | null {
  if (!isRecord(raw)) return null
  const kind = raw.kind
  const value = raw.value
  if ((kind !== 'emoji' && kind !== 'icon') || typeof value !== 'string' || !value.trim()) {
    return null
  }
  return { kind, value: value.trim() }
}

function parseCatalogEntry(raw: unknown): ExpertCatalogEntry | null {
  if (!isRecord(raw)) return null
  const id = typeof raw.id === 'string' ? raw.id.trim() : ''
  if (!isValidExpertId(id)) return null
  const title = typeof raw.title === 'string' ? raw.title.trim() : ''
  const summary = typeof raw.summary === 'string' ? raw.summary.trim() : ''
  if (!title || !summary) return null
  const icon = parseIcon(raw.icon)
  if (!icon) return null
  if (!Array.isArray(raw.tags)) return null
  const tags = raw.tags
    .map(tag => (typeof tag === 'string' ? tag.trim() : ''))
    .filter(Boolean)
  if (tags.length === 0) return null
  return {
    id,
    title,
    summary,
    icon,
    tags,
    official: raw.official === true || raw.official === undefined,
    version: typeof raw.version === 'string' ? raw.version : undefined,
    source: raw.source === 'local' ? 'local' : 'builtin',
  }
}

export function parseExpertDefinition(raw: unknown): ExpertDefinition | null {
  if (!isRecord(raw)) return null
  const entry = parseCatalogEntry(raw)
  if (!entry) return null
  const personaRaw = typeof raw.persona === 'string' ? raw.persona : ''
  const persona = sanitizeExpertPersona(personaRaw)
  if (!persona) return null
  if (!Array.isArray(raw.defaultPacks) || raw.defaultPacks.length === 0) return null
  const defaultPacks = raw.defaultPacks.filter(
    (pack): pack is string => typeof pack === 'string' && pack.trim().length > 0,
  )
  if (defaultPacks.length === 0) return null
  const tier = raw.defaultResearchTier
  if (tier !== 'L1' && tier !== 'L2' && tier !== 'L3') return null
  const complianceVersion = raw.complianceVersion
  if (complianceVersion !== EXPERT_COMPLIANCE_VERSION) return null
  const starterPrompts = normalizeExpertStarterPrompts(raw.starterPrompts)
  return {
    ...entry,
    icon: entry.icon.kind === 'icon' ? entry.icon : DEFAULT_EXPERT_ICON,
    source: 'builtin',
    official: entry.official ?? true,
    persona,
    defaultPacks,
    defaultResearchTier: tier,
    defaultSessionTitle:
      typeof raw.defaultSessionTitle === 'string' && raw.defaultSessionTitle.trim()
        ? raw.defaultSessionTitle.trim()
        : undefined,
    complianceVersion,
    ...(starterPrompts ? { starterPrompts } : {}),
  }
}

async function fetchJson(url: string): Promise<unknown | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const resp = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    })
    if (!resp.ok) return null
    return await resp.json()
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

function readCache<T>(entry: CacheEntry<T> | null | undefined): T | null {
  if (!entry) return null
  if (Date.now() > entry.expiresAt) return null
  return entry.value
}

function matchesQuery(entry: ExpertCatalogEntry, query?: ExpertListQuery): boolean {
  if (query?.tag && !entry.tags.includes(query.tag)) return false
  const q = query?.q?.trim().toLowerCase()
  if (!q) return true
  const haystack = [entry.title, entry.summary, ...entry.tags].join(' ').toLowerCase()
  return haystack.includes(q)
}

export class StaticHttpExpertProvider implements RemoteExpertProvider {
  private readonly baseUrl: string

  constructor(baseUrl?: string) {
    this.baseUrl = (baseUrl ?? resolveBaseUrl()).replace(/\/+$/, '')
  }

  async fetchCatalogEntries(): Promise<ExpertCatalogEntry[]> {
    return this.loadCatalogEntries()
  }

  async listExperts(query?: ExpertListQuery): Promise<ExpertCatalog> {
    const catalog = await this.loadCatalogEntries()
    const filtered = catalog.filter(entry => matchesQuery(entry, query))
    const limit = Math.min(Math.max(query?.limit ?? 50, 1), 100)
    const offset = query?.cursor ? Number.parseInt(query.cursor, 10) : 0
    const start = Number.isFinite(offset) && offset > 0 ? offset : 0
    const slice = filtered.slice(start, start + limit)
    const nextStart = start + slice.length
    return {
      experts: slice,
      source: 'remote',
      fetchedAt: new Date().toISOString(),
      nextCursor: nextStart < filtered.length ? String(nextStart) : undefined,
    }
  }

  async getExpert(id: string): Promise<ExpertDefinition | null> {
    const trimmed = id.trim()
    if (!isValidExpertId(trimmed)) return null

    const cached = readCache(expertCache.get(trimmed))
    if (cached) return cached

    const raw = await fetchJson(`${this.baseUrl}/${encodeURIComponent(trimmed)}.json`)
    const parsed = parseExpertDefinition(raw)
    if (!parsed) return null

    expertCache.set(trimmed, { value: parsed, expiresAt: Date.now() + CACHE_TTL_MS })
    return parsed
  }

  private async loadCatalogEntries(): Promise<ExpertCatalogEntry[]> {
    const cached = readCache(catalogCache)
    if (cached) return cached

    const raw = await fetchJson(`${this.baseUrl}/catalog.json`)
    if (!isRecord(raw) || !Array.isArray(raw.experts)) {
      throw new Error('remote expert catalog unavailable')
    }
    const parsed: ExpertCatalogEntry[] = []
    for (const item of raw.experts) {
      const entry = parseCatalogEntry(item)
      if (entry) parsed.push(entry)
    }
    if (parsed.length === 0) {
      throw new Error('remote expert catalog empty')
    }
    catalogCache = { value: parsed, expiresAt: Date.now() + CACHE_TTL_MS }
    return parsed
  }
}

export function resetStaticHttpExpertProviderForTests(): void {
  catalogCache = null
  expertCache.clear()
}
