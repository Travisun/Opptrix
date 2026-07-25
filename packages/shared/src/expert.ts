import type { ResearchTier } from './agent-prompt-guide.js'

export const EXPERT_COMPLIANCE_VERSION = '1'

export const LOCAL_EXPERTS_NAMESPACE = 'local_experts'

export const DEFAULT_EXPERT_ICON: ExpertIcon = { kind: 'icon', value: 'expert' }

export interface ExpertIcon {
  kind: 'emoji' | 'icon'
  value: string
}

export interface ExpertCatalogEntry {
  id: string
  title: string
  summary: string
  icon: ExpertIcon
  tags: string[]
  official?: boolean
  version?: string
  /** 内置 catalog 或用户本地创建 */
  source?: 'local' | 'builtin'
}

export interface ExpertDefinition extends ExpertCatalogEntry {
  persona: string
  defaultPacks: string[]
  defaultResearchTier: ResearchTier
  defaultSessionTitle?: string
  complianceVersion: string
}

export interface ExpertCatalog {
  experts: ExpertCatalogEntry[]
  source: 'local' | 'remote'
  fetchedAt: string
  nextCursor?: string
}

export interface ExpertListQuery {
  q?: string
  tag?: string
  limit?: number
  cursor?: string
  /** public=官方内置；personal=本地自建；all=合并（默认） */
  scope?: 'public' | 'personal' | 'all'
}

export interface ExpertCreateInput {
  title: string
  summary: string
  persona: string
  tags?: string[]
}

export interface ExpertPatchInput {
  title?: string
  summary?: string
  persona?: string
  tags?: string[]
}

export function isValidExpertId(id: string): boolean {
  return /^[a-z][a-z0-9_-]{0,63}$/.test(id)
}
