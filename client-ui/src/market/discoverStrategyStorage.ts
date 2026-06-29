import type { CustomDiscoverStrategy } from '../types/schemas'

const STORAGE_KEY = 'inno-discover-custom-strategies'
const CHANGE_EVENT = 'inno-discover-strategies-change'

export function loadCustomDiscoverStrategies(): CustomDiscoverStrategy[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as CustomDiscoverStrategy[]
    if (!Array.isArray(parsed)) return []
    return parsed.map(normalizeCustomStrategy)
  } catch {
    return []
  }
}

function normalizeCustomStrategy(row: CustomDiscoverStrategy): CustomDiscoverStrategy {
  const prompt = row.prompt?.trim() ?? ''
  const description = row.description?.trim() || prompt
  const tagline = row.tagline?.trim() || (description.length > 48 ? `${description.slice(0, 48)}…` : description)
  return {
    ...row,
    description,
    tagline,
    methodology: row.methodology ?? '',
    refinement_notes: row.refinement_notes ?? '',
    copied_from: row.copied_from ?? null,
  }
}

export function persistCustomDiscoverStrategies(items: CustomDiscoverStrategy[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT))
}

export function subscribeCustomDiscoverStrategies(listener: () => void) {
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) listener()
  }
  window.addEventListener('storage', onStorage)
  window.addEventListener(CHANGE_EVENT, listener)
  return () => {
    window.removeEventListener('storage', onStorage)
    window.removeEventListener(CHANGE_EVENT, listener)
  }
}

export function saveCustomDiscoverStrategy(
  items: CustomDiscoverStrategy[],
  input: Partial<CustomDiscoverStrategy> & { name: string; prompt: string },
): { items: CustomDiscoverStrategy[]; saved: CustomDiscoverStrategy } | null {
  const prompt = input.prompt.trim()
  if (!prompt) return null
  const now = new Date().toISOString()
  const id = input.id ?? `custom_${crypto.randomUUID()}`
  const existing = items.find(s => s.id === id)
  const description = input.description?.trim() || prompt
  const saved: CustomDiscoverStrategy = {
    id,
    name: input.name.trim() || description.slice(0, 24),
    prompt,
    tagline: input.tagline?.trim() || (description.length > 48 ? `${description.slice(0, 48)}…` : description),
    description,
    methodology: input.methodology?.trim() ?? existing?.methodology ?? '',
    refinement_notes: input.refinement_notes?.trim() ?? existing?.refinement_notes ?? '',
    copied_from: input.copied_from ?? existing?.copied_from ?? null,
    created_at: existing?.created_at ?? now,
    updated_at: now,
  }
  const idx = items.findIndex(s => s.id === id)
  const next = idx >= 0
    ? items.map((s, i) => (i === idx ? saved : s))
    : [saved, ...items]
  persistCustomDiscoverStrategies(next)
  return { items: next, saved }
}

export function removeCustomDiscoverStrategy(items: CustomDiscoverStrategy[], id: string): CustomDiscoverStrategy[] {
  const next = items.filter(s => s.id !== id)
  persistCustomDiscoverStrategies(next)
  return next
}
