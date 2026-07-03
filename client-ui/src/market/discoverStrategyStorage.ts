import type { CustomDiscoverStrategy } from '../types/schemas'
import { defaultDiscoverProfile } from './discoverProfiles'
import {
  fetchCustomDiscoverStrategies,
  saveCustomDiscoverStrategies,
} from '../api/client'

const CHANGE_EVENT = 'opptrix-discover-strategies-change'

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
    profile: row.profile ?? defaultDiscoverProfile(),
    copied_from: row.copied_from ?? null,
  }
}

export async function loadCustomDiscoverStrategies(): Promise<CustomDiscoverStrategy[]> {
  try {
    const resp = await fetchCustomDiscoverStrategies()
    return (resp.strategies ?? []).map(normalizeCustomStrategy)
  } catch {
    return []
  }
}

export function persistCustomDiscoverStrategies(items: CustomDiscoverStrategy[]) {
  void saveCustomDiscoverStrategies(items).then(() => {
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT))
  }).catch(() => {})
}

export function subscribeCustomDiscoverStrategies(listener: () => void) {
  window.addEventListener(CHANGE_EVENT, listener)
  return () => window.removeEventListener(CHANGE_EVENT, listener)
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
  const saved: CustomDiscoverStrategy = normalizeCustomStrategy({
    id,
    name: input.name.trim() || description.slice(0, 24),
    prompt,
    tagline: input.tagline?.trim() || (description.length > 48 ? `${description.slice(0, 48)}…` : description),
    description,
    methodology: input.methodology?.trim() ?? existing?.methodology ?? '',
    refinement_notes: input.refinement_notes?.trim() ?? existing?.refinement_notes ?? '',
    profile: input.profile ?? existing?.profile ?? defaultDiscoverProfile(),
    copied_from: input.copied_from ?? existing?.copied_from ?? null,
    created_at: existing?.created_at ?? now,
    updated_at: now,
  })
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
