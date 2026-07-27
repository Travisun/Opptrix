import type { ResearchTier } from './agent-prompt-guide.js'

export const EXPERT_COMPLIANCE_VERSION = '1'

export const LOCAL_EXPERTS_NAMESPACE = 'local_experts'

export const DEFAULT_EXPERT_ICON: ExpertIcon = { kind: 'icon', value: 'expert' }

/** 专家预定义快捷提问上限 */
export const MAX_EXPERT_STARTER_PROMPTS = 6

/** title 缺省时从 content 截断的展示长度 */
const STARTER_TITLE_FALLBACK_LEN = 24

export interface ExpertIcon {
  kind: 'emoji' | 'icon'
  value: string
}

export interface ExpertStarterPrompt {
  id: string
  /** chip 短文案 */
  title: string
  /** 点击后发送的正文；title 空时可用 content 截断展示 */
  content: string
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
  /** 空会话 Composer 快捷提问；缺省或空 = 无 */
  starterPrompts?: ExpertStarterPrompt[]
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
  starterPrompts?: ExpertStarterPrompt[]
}

export interface ExpertPatchInput {
  title?: string
  summary?: string
  persona?: string
  tags?: string[]
  starterPrompts?: ExpertStarterPrompt[]
}

export function isValidExpertId(id: string): boolean {
  return /^[a-z][a-z0-9_-]{0,63}$/.test(id)
}

function makeStarterId(seen: Set<string>): string {
  for (let i = 0; i < 32; i += 1) {
    const id = typeof globalThis.crypto?.randomUUID === 'function'
      ? `sp-${globalThis.crypto.randomUUID().slice(0, 8)}`
      : `sp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
    if (!seen.has(id)) return id
  }
  return `sp-${Date.now().toString(36)}-${seen.size}`
}

function fallbackTitle(content: string): string {
  if (content.length <= STARTER_TITLE_FALLBACK_LEN) return content
  return `${content.slice(0, STARTER_TITLE_FALLBACK_LEN)}…`
}

/**
 * 规范化专家快捷提问：trim、去空 content、id 唯一、最多 6 条；
 * title 缺省时用 content 前若干字。非法项跳过。
 * 空结果返回 undefined（表示无快捷提问）。
 */
export function normalizeExpertStarterPrompts(raw: unknown): ExpertStarterPrompt[] | undefined {
  if (raw === undefined || raw === null) return undefined
  if (!Array.isArray(raw)) return undefined

  const seen = new Set<string>()
  const out: ExpertStarterPrompt[] = []

  for (const item of raw) {
    if (out.length >= MAX_EXPERT_STARTER_PROMPTS) break
    if (typeof item !== 'object' || item === null || Array.isArray(item)) continue
    const rec = item as Record<string, unknown>
    const content = typeof rec.content === 'string' ? rec.content.trim() : ''
    if (!content) continue

    let title = typeof rec.title === 'string' ? rec.title.trim() : ''
    if (!title) title = fallbackTitle(content)

    let id = typeof rec.id === 'string' ? rec.id.trim() : ''
    if (!id || seen.has(id)) {
      id = makeStarterId(seen)
    }
    seen.add(id)
    out.push({ id, title, content })
  }

  return out.length > 0 ? out : undefined
}
