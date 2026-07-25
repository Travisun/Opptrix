import type { ChatToolStep } from './chatProgress'

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
  source?: 'local' | 'builtin'
}

export interface ExpertDefinition extends ExpertCatalogEntry {
  persona: string
  defaultPacks: string[]
  defaultResearchTier: 'L1' | 'L2' | 'L3'
  defaultSessionTitle?: string
  complianceVersion: string
}

export interface ExpertCatalog {
  experts: ExpertCatalogEntry[]
  source: 'local' | 'remote'
  fetchedAt: string
  nextCursor?: string
}

export interface SessionMeta {
  id: string
  title: string
  createdAt: string
  updatedAt: string
  /** providerId:modelName */
  model?: string
  archivedAt?: string | null
  archiveFolderId?: string | null
  expertId?: string | null
  expertIcon?: ExpertIcon | null
}

export interface SessionArchiveFolder {
  id: string
  title: string
  sortOrder: number
  isDefault: boolean
}

export interface AvailableModel {
  ref: string
  model: string
  providerId: string
  providerName: string
  /** 启发式上下文窗口（tokens） */
  contextTokens?: number
}

export interface ChatDisplayMessage {
  role: 'user' | 'assistant'
  content: string
  toolsUsed?: string[]
  toolSteps?: ChatToolStep[]
  at: string
}

export interface SessionForkContextRef {
  kind: 'fork'
  sourceSessionId: string
  sourceSessionTitle: string
  anchorIndex: number
  anchorAt: string
  preview: string
  turns: ChatDisplayMessage[]
}

export interface SessionSelectionContextRef {
  kind: 'selection'
  selectedText: string
  sourceMessageIndex: number
  sourceRole: 'user' | 'assistant'
  anchorAt: string
  preview: string
  turns: ChatDisplayMessage[]
}

export interface SessionArticleContextRef {
  kind: 'article'
  articleId: string
  title: string
  sourceTitle: string
  link: string
  pubDate: string
  bodyText: string
  anchorAt: string
  preview: string
}

export type SessionContextRef = SessionForkContextRef | SessionSelectionContextRef | SessionArticleContextRef

export interface MessageSelection {
  text: string
  messageIndex: number
  messageRole: 'user' | 'assistant'
}

export interface EphemeralAskTurn {
  role: 'user' | 'assistant'
  content: string
}
