import { randomUUID } from 'node:crypto'
import { getUserDataStore } from '@opptrix/user-store'

import type { DiscoverStrategyProfile } from '@opptrix/shared'
import { defaultDiscoverProfile } from '@opptrix/shared'

const NAMESPACE = 'discover_custom_strategy'

export interface CustomDiscoverStrategyRecord {
  id: string
  name: string
  tagline: string
  description: string
  methodology: string
  refinement_notes: string
  prompt: string
  profile: DiscoverStrategyProfile
  copied_from?: string | null
  created_at: string
  updated_at: string
}

function normalize(row: CustomDiscoverStrategyRecord): CustomDiscoverStrategyRecord {
  const prompt = row.prompt?.trim() ?? ''
  const description = row.description?.trim() || prompt
  const tagline = row.tagline?.trim() || (description.length > 48 ? `${description.slice(0, 48)}…` : description)
  return {
    ...row,
    prompt,
    description,
    tagline,
    methodology: row.methodology ?? '',
    refinement_notes: row.refinement_notes ?? '',
    profile: row.profile ?? defaultDiscoverProfile(),
    copied_from: row.copied_from ?? null,
  }
}

export function listCustomDiscoverStrategies(): CustomDiscoverStrategyRecord[] {
  return getUserDataStore()
    .listDocuments<CustomDiscoverStrategyRecord>(NAMESPACE)
    .map(normalize)
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
}

export function replaceCustomDiscoverStrategies(items: CustomDiscoverStrategyRecord[]) {
  const store = getUserDataStore()
  const allowed = items
    .map(normalize)
    .filter(item => item.profile !== 'cn_equity')
  const keep = new Set(allowed.map(item => item.id))
  for (const item of allowed) {
    store.setDocument(NAMESPACE, item.id, item)
  }
  for (const id of store.listDocumentIds(NAMESPACE)) {
    if (!keep.has(id)) store.deleteDocument(NAMESPACE, id)
  }
}

export function upsertCustomDiscoverStrategy(
  input: Partial<CustomDiscoverStrategyRecord> & { name: string; prompt: string },
): CustomDiscoverStrategyRecord | null {
  const prompt = input.prompt.trim()
  if (!prompt) return null
  const profile = input.profile ?? existingProfileFallback(input) ?? defaultDiscoverProfile()
  if (profile === 'cn_equity') {
    throw new Error('A 股自动选股策略已移除，无法创建或保存 A 股股票自建策略')
  }
  const now = new Date().toISOString()
  const id = input.id ?? `custom_${randomUUID()}`
  const existing = getUserDataStore().getDocument<CustomDiscoverStrategyRecord>(NAMESPACE, id)
  const description = input.description?.trim() || prompt
  const saved = normalize({
    id,
    name: input.name.trim() || description.slice(0, 24),
    prompt,
    tagline: input.tagline?.trim() || (description.length > 48 ? `${description.slice(0, 48)}…` : description),
    description,
    methodology: input.methodology?.trim() ?? existing?.methodology ?? '',
    refinement_notes: input.refinement_notes?.trim() ?? existing?.refinement_notes ?? '',
    profile,
    copied_from: input.copied_from ?? existing?.copied_from ?? null,
    created_at: existing?.created_at ?? now,
    updated_at: now,
  })
  getUserDataStore().setDocument(NAMESPACE, id, saved)
  return saved
}

function existingProfileFallback(
  input: Partial<CustomDiscoverStrategyRecord>,
): DiscoverStrategyProfile | undefined {
  if (input.id) {
    return getUserDataStore().getDocument<CustomDiscoverStrategyRecord>(NAMESPACE, input.id)?.profile
  }
  return undefined
}

export function deleteCustomDiscoverStrategy(id: string): boolean {
  const store = getUserDataStore()
  if (!store.getDocument(NAMESPACE, id)) return false
  store.deleteDocument(NAMESPACE, id)
  return true
}
