import type { ChatToolStep } from './chatProgress'

export interface ExpertIcon {
  kind: 'emoji' | 'icon'
  value: string
}

export interface ExpertStarterPrompt {
  id: string
  title: string
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
  source?: 'local' | 'builtin'
}

export interface ExpertDefinition extends ExpertCatalogEntry {
  persona: string
  defaultPacks: string[]
  defaultResearchTier: 'L1' | 'L2' | 'L3'
  defaultSessionTitle?: string
  complianceVersion: string
  starterPrompts?: ExpertStarterPrompt[]
}

export interface ComposerStarterChip {
  label: string
  text: string
}

export interface ExpertCatalog {
  experts: ExpertCatalogEntry[]
  source: 'local' | 'remote'
  fetchedAt: string
  nextCursor?: string
}

export interface TokenUsage {
  promptTokens: number
  completionTokens: number
  totalTokens: number
}

export interface ChatContextUsage {
  usedTokens: number
  limitTokens: number
  remainingTokens: number
  modelRef: string
  estimated: boolean
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
  usageTotals?: TokenUsage | null
}

export interface SessionArchiveFolder {
  id: string
  title: string
  sortOrder: number
  isDefault: boolean
}

export interface AttachmentLimits {
  maxBytesByKind: Partial<Record<MediaKind, number>>
  maxCount: number
  maxTotalBytes: number
}

export type MediaKind = 'text' | 'image' | 'pdf' | 'document' | 'video' | 'audio'

export type AttachmentExtractStatus = 'pending' | 'ready' | 'failed'

/** 整理子阶段（可选；旧客户端可忽略） */
export type AttachmentExtractPhase =
  | 'converting'
  | 'extracting'
  | 'ocr'
  | 'ready'
  | 'failed'

export interface AttachmentExtractMeta {
  status: AttachmentExtractStatus
  documentId?: string
  error?: string
  pageCount?: number
  charCount?: number
  readyAt?: string
  phase?: AttachmentExtractPhase
  ocrDone?: number
  ocrTotal?: number
  message?: string
}

export interface ChatAttachmentMeta {
  id: string
  kind: MediaKind
  mime: string
  name: string
  size: number
  createdAt: string
  width?: number
  height?: number
  duration?: number
  extract?: AttachmentExtractMeta
}

export interface ModelMediaCapabilities {
  attachment: boolean
  input: MediaKind[]
  output: MediaKind[]
  limits: AttachmentLimits
}

export interface AvailableModel {
  ref: string
  model: string
  providerId: string
  providerName: string
  /** 启发式上下文窗口（tokens） */
  contextTokens?: number
  attachment?: boolean
  inputModalities?: MediaKind[]
  outputModalities?: MediaKind[]
  attachmentLimits?: AttachmentLimits
  media?: ModelMediaCapabilities
}

export interface ChatDisplayMessage {
  role: 'user' | 'assistant'
  content: string
  toolsUsed?: string[]
  toolSteps?: ChatToolStep[]
  at: string
  usage?: TokenUsage
  usageEstimated?: boolean
  attachments?: ChatAttachmentMeta[]
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
