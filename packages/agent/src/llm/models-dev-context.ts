import { resolveAttachmentLimits } from '../attachment-limits.js'
import type { MediaKind, ModelMediaCapabilities } from '../media-types.js'
import { resolveModelContextTokens } from './model-context.js'

const MODELS_DEV_URL = 'https://models.dev/api.json'
const CACHE_TTL_MS = 60 * 60 * 1000
const FETCH_TIMEOUT_MS = 12_000
const MIN_SUBSTRING_LEN = 5

const STRIP_PREFIXES = [
  'openai/',
  'anthropic/',
  'google/',
  'gemini/',
  'deepseek/',
  'deepseek-ai/',
  'qwen/',
  'moonshot/',
  'moonshotai/',
  'mistral/',
  'mistralai/',
  'meta-llama/',
  'meta/',
  'zhipuai/',
  'zai-org/',
  'perplexity/',
  'xai/',
  'cohere/',
  'nvidia/',
  'microsoft/',
]

export interface ModelsDevLimit {
  context: number
  output?: number
}

interface ModelsDevModalities {
  input?: string[]
  output?: string[]
}

interface ModelsDevModelEntry {
  limit?: { context?: number; output?: number }
  attachment?: boolean
  modalities?: ModelsDevModalities
}

interface ModelsDevProviderEntry {
  id?: string
  models?: Record<string, ModelsDevModelEntry>
}

type ModelsDevCatalog = Record<string, ModelsDevProviderEntry>

let memoryCache: { fetchedAt: number; catalog: ModelsDevCatalog } | null = null
let inflightFetch: Promise<ModelsDevCatalog | null> | null = null

export function resetModelsDevCacheForTests() {
  memoryCache = null
  inflightFetch = null
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}

function normalizeModelKey(id: string): string {
  return id.trim().toLowerCase()
    .replace(/_/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
}

function stripCommonPrefix(id: string): string {
  const lower = id.toLowerCase()
  for (const prefix of STRIP_PREFIXES) {
    if (lower.startsWith(prefix)) return id.slice(prefix.length)
  }
  return id
}

function parseProvidersMap(data: unknown): ModelsDevCatalog {
  if (!isRecord(data)) return {}
  if (isRecord(data.providers)) {
    return data.providers as ModelsDevCatalog
  }
  const out: ModelsDevCatalog = {}
  for (const [key, value] of Object.entries(data)) {
    if (isRecord(value) && isRecord(value.models)) {
      out[key] = value as ModelsDevProviderEntry
    }
  }
  return out
}

function limitFromEntry(entry: ModelsDevModelEntry | undefined): ModelsDevLimit | null {
  const ctx = entry?.limit?.context
  if (typeof ctx === 'number' && ctx > 0) {
    const output = entry?.limit?.output
    return {
      context: ctx,
      ...(typeof output === 'number' && output > 0 ? { output } : {}),
    }
  }
  return null
}

function splitModelRef(modelId: string): { provider?: string; model: string } {
  const trimmed = modelId.trim()
  const colon = trimmed.indexOf(':')
  if (colon > 0) {
    return {
      provider: trimmed.slice(0, colon).trim(),
      model: trimmed.slice(colon + 1).trim(),
    }
  }
  return { model: trimmed }
}

function collectModelKeys(
  catalog: ModelsDevCatalog,
  providerId?: string,
): Array<{ provider: string; modelKey: string }> {
  const out: Array<{ provider: string; modelKey: string }> = []
  const providers = providerId
    ? [[providerId, catalog[providerId]] as const]
    : Object.entries(catalog)
  for (const [provider, entry] of providers) {
    if (!entry?.models) continue
    for (const modelKey of Object.keys(entry.models)) {
      out.push({ provider, modelKey })
    }
  }
  return out
}

function matchInProvider(
  catalog: ModelsDevCatalog,
  providerId: string,
  query: string,
): ModelsDevLimit | null {
  const provider = catalog[providerId]
  if (!provider?.models) return null
  const models = provider.models
  const candidates = [
    query,
    query.toLowerCase(),
    stripCommonPrefix(query),
    normalizeModelKey(query),
    normalizeModelKey(stripCommonPrefix(query)),
  ]
  for (const candidate of candidates) {
    if (!candidate) continue
    if (models[candidate]) {
      const hit = limitFromEntry(models[candidate])
      if (hit) return hit
    }
    const lower = candidate.toLowerCase()
    for (const [key, entry] of Object.entries(models)) {
      if (key.toLowerCase() === lower) {
        const hit = limitFromEntry(entry)
        if (hit) return hit
      }
    }
  }
  return null
}

function substringMatch(
  catalog: ModelsDevCatalog,
  query: string,
  providerId?: string,
): ModelsDevLimit | null {
  const normalizedQuery = normalizeModelKey(stripCommonPrefix(query))
  if (normalizedQuery.length < MIN_SUBSTRING_LEN) return null

  for (const { provider, modelKey } of collectModelKeys(catalog, providerId)) {
    const normalizedKey = normalizeModelKey(stripCommonPrefix(modelKey))
    if (normalizedKey.length < MIN_SUBSTRING_LEN) continue
    const contains = normalizedKey.includes(normalizedQuery) || normalizedQuery.includes(normalizedKey)
    if (!contains) continue
    const hit = limitFromEntry(catalog[provider]?.models?.[modelKey])
    if (hit) return hit
  }
  return null
}

export function lookupModelsDevContextLimit(
  catalog: ModelsDevCatalog,
  modelId: string,
  providerId?: string,
): ModelsDevLimit | null {
  const { provider: refProvider, model } = splitModelRef(modelId)
  const effectiveProvider = providerId?.trim() || refProvider
  const query = model || modelId

  if (effectiveProvider) {
    const direct = matchInProvider(catalog, effectiveProvider, query)
    if (direct) return direct
  }

  if (effectiveProvider) {
    const fuzzy = substringMatch(catalog, query, effectiveProvider)
    if (fuzzy) return fuzzy
  }

  for (const provider of Object.keys(catalog)) {
    if (provider === effectiveProvider) continue
    const hit = matchInProvider(catalog, provider, query)
    if (hit) return hit
  }

  return substringMatch(catalog, query)
}

async function fetchModelsDevCatalog(): Promise<ModelsDevCatalog | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const resp = await fetch(MODELS_DEV_URL, { signal: controller.signal })
    if (!resp.ok) return null
    const data: unknown = await resp.json()
    return parseProvidersMap(data)
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

export async function getModelsDevCatalog(forceRefresh = false): Promise<ModelsDevCatalog | null> {
  const now = Date.now()
  if (!forceRefresh && memoryCache && now - memoryCache.fetchedAt < CACHE_TTL_MS) {
    return memoryCache.catalog
  }
  if (!inflightFetch) {
    inflightFetch = fetchModelsDevCatalog().finally(() => {
      inflightFetch = null
    })
  }
  const catalog = await inflightFetch
  if (catalog) {
    memoryCache = { fetchedAt: now, catalog }
    return catalog
  }
  return memoryCache?.catalog ?? null
}

export async function resolveModelContextTokensAsync(
  modelId: string,
  providerId?: string,
): Promise<number> {
  const catalog = await getModelsDevCatalog()
  if (catalog) {
    const limit = lookupModelsDevContextLimit(catalog, modelId, providerId)
    if (limit) return limit.context
  }
  const { model } = splitModelRef(modelId)
  return resolveModelContextTokens(model || modelId)
}

function normalizeMediaKind(raw: string): MediaKind | null {
  const v = raw.trim().toLowerCase()
  if (v === 'text' || v === 'image' || v === 'pdf' || v === 'video' || v === 'audio') {
    return v
  }
  return null
}

function mediaFromEntry(entry: ModelsDevModelEntry | undefined): {
  attachment: boolean
  input: MediaKind[]
  output: MediaKind[]
} {
  const inputRaw = entry?.modalities?.input ?? ['text']
  const outputRaw = entry?.modalities?.output ?? ['text']
  const input = inputRaw
    .map(normalizeMediaKind)
    .filter((k): k is MediaKind => k !== null)
  const output = outputRaw
    .map(normalizeMediaKind)
    .filter((k): k is MediaKind => k !== null)
  const attachment = entry?.attachment === true
    || input.some(k => k !== 'text')
  return {
    attachment,
    input: input.length ? input : ['text'],
    output: output.length ? output : ['text'],
  }
}

function matchModelEntry(
  catalog: ModelsDevCatalog,
  modelId: string,
  providerId?: string,
): ModelsDevModelEntry | null {
  const { provider: refProvider, model } = splitModelRef(modelId)
  const effectiveProvider = providerId?.trim() || refProvider
  const query = model || modelId

  if (effectiveProvider) {
    const provider = catalog[effectiveProvider]
    if (provider?.models) {
      const candidates = [
        query,
        query.toLowerCase(),
        stripCommonPrefix(query),
        normalizeModelKey(query),
        normalizeModelKey(stripCommonPrefix(query)),
      ]
      for (const candidate of candidates) {
        if (!candidate) continue
        if (provider.models[candidate]) return provider.models[candidate]
        const lower = candidate.toLowerCase()
        for (const [key, entry] of Object.entries(provider.models)) {
          if (key.toLowerCase() === lower) return entry
        }
      }
    }
  }

  for (const { provider, modelKey } of collectModelKeys(catalog, providerId)) {
    const normalizedQuery = normalizeModelKey(stripCommonPrefix(query))
    const normalizedKey = normalizeModelKey(stripCommonPrefix(modelKey))
    if (normalizedQuery.length >= MIN_SUBSTRING_LEN && (
      normalizedKey.includes(normalizedQuery) || normalizedQuery.includes(normalizedKey)
    )) {
      return catalog[provider]?.models?.[modelKey] ?? null
    }
  }

  for (const provider of Object.keys(catalog)) {
    if (provider === effectiveProvider) continue
    const hit = matchInProvider(catalog, provider, query)
    if (hit) {
      const providerEntry = catalog[provider]
      if (!providerEntry?.models) continue
      for (const [key, entry] of Object.entries(providerEntry.models)) {
        const limit = limitFromEntry(entry)
        if (limit && limit.context === hit.context) return entry
        if (key.toLowerCase().includes(query.toLowerCase())) return entry
      }
    }
  }

  return null
}

export function lookupModelsDevMediaEntry(
  catalog: ModelsDevCatalog,
  modelId: string,
  providerId?: string,
): ReturnType<typeof mediaFromEntry> | null {
  const entry = matchModelEntry(catalog, modelId, providerId)
  if (!entry) return null
  return mediaFromEntry(entry)
}

export async function resolveModelMediaCapabilitiesAsync(
  modelId: string,
  providerId?: string,
): Promise<ModelMediaCapabilities> {
  const catalog = await getModelsDevCatalog()
  const fromCatalog = catalog
    ? lookupModelsDevMediaEntry(catalog, modelId, providerId)
    : null

  const input = fromCatalog?.input ?? ['text']
  const output = fromCatalog?.output ?? ['text']
  const attachment = fromCatalog?.attachment ?? input.some(k => k !== 'text')

  return {
    attachment,
    input,
    output,
    limits: resolveAttachmentLimits(modelId, input),
  }
}

export function defaultTextOnlyMediaCapabilities(): ModelMediaCapabilities {
  return {
    attachment: false,
    input: ['text'],
    output: ['text'],
    limits: resolveAttachmentLimits('default', ['text']),
  }
}

export async function resolveModelsDevOutputReserve(
  modelId: string,
  providerId?: string,
): Promise<number | undefined> {
  const catalog = await getModelsDevCatalog()
  if (!catalog) return undefined
  const limit = lookupModelsDevContextLimit(catalog, modelId, providerId)
  return limit?.output
}
