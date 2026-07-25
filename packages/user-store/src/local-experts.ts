/**
 * 用户自建专家 — documents 命名空间 `local_experts`。
 */

import { randomUUID } from 'node:crypto'
import {
  DEFAULT_EXPERT_ICON,
  EXPERT_COMPLIANCE_VERSION,
  isValidExpertId,
  LOCAL_EXPERTS_NAMESPACE,
  type ExpertCreateInput,
  type ExpertDefinition,
  type ExpertPatchInput,
} from '@opptrix/shared'
import type { UserDataStore } from './store.js'

const DEFAULT_PACKS = ['fundamentals', 'instrument_analytics'] as const

function nowIso(): string {
  return new Date().toISOString()
}

function slugifyId(title: string): string {
  const base = title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
  return base ? `local-${base}` : `local-${Date.now().toString(36)}`
}

function normalizeTags(tags: string[] | undefined): string[] {
  if (!tags?.length) return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of tags) {
    const tag = raw.trim()
    if (!tag || seen.has(tag)) continue
    seen.add(tag)
    out.push(tag)
  }
  return out.slice(0, 8)
}

export class LocalExpertsRepository {
  constructor(private readonly store: UserDataStore) {}

  listAll(): ExpertDefinition[] {
    return this.store
      .listDocuments<ExpertDefinition>(LOCAL_EXPERTS_NAMESPACE)
      .slice()
      .sort((a, b) => a.title.localeCompare(b.title, 'zh-CN'))
  }

  get(id: string): ExpertDefinition | null {
    return this.store.getDocument<ExpertDefinition>(LOCAL_EXPERTS_NAMESPACE, id)
  }

  create(input: ExpertCreateInput, persona: string): ExpertDefinition {
    const title = input.title.trim()
    const summary = input.summary.trim()
    if (!title) throw new Error('请填写专家名称')
    if (!summary) throw new Error('请填写专家简介')
    if (!persona) throw new Error('角色设定无效，请修改后重试')

    let id = slugifyId(title)
    if (!isValidExpertId(id)) {
      id = `local-${randomUUID().slice(0, 8)}`
    }
    while (this.get(id)) {
      id = `${id.slice(0, 48)}-${randomUUID().slice(0, 4)}`
    }

    const ts = nowIso()
    const row: ExpertDefinition = {
      id,
      title,
      summary,
      icon: DEFAULT_EXPERT_ICON,
      tags: normalizeTags(input.tags),
      official: false,
      source: 'local',
      persona,
      defaultPacks: [...DEFAULT_PACKS],
      defaultResearchTier: 'L2',
      defaultSessionTitle: title,
      complianceVersion: EXPERT_COMPLIANCE_VERSION,
      version: '1.0.0',
    }
    this.store.setDocument(LOCAL_EXPERTS_NAMESPACE, id, row)
    return row
  }

  save(id: string, patch: ExpertPatchInput, persona?: string): ExpertDefinition {
    const prev = this.get(id)
    if (!prev) throw new Error('找不到该专家')
    if (prev.source !== 'local') throw new Error('内置专家不可编辑')

    const title = patch.title !== undefined ? patch.title.trim() : prev.title
    const summary = patch.summary !== undefined ? patch.summary.trim() : prev.summary
    if (!title) throw new Error('请填写专家名称')
    if (!summary) throw new Error('请填写专家简介')

    const nextPersona = persona ?? prev.persona
    if (!nextPersona) throw new Error('角色设定无效，请修改后重试')

    const row: ExpertDefinition = {
      ...prev,
      title,
      summary,
      persona: nextPersona,
      tags: patch.tags !== undefined ? normalizeTags(patch.tags) : prev.tags,
      defaultSessionTitle: title,
      version: prev.version ?? '1.0.0',
    }
    this.store.setDocument(LOCAL_EXPERTS_NAMESPACE, id, row)
    return row
  }

  delete(id: string): boolean {
    const prev = this.get(id)
    if (!prev) return false
    if (prev.source !== 'local') return false
    this.store.deleteDocument(LOCAL_EXPERTS_NAMESPACE, id)
    return true
  }
}
