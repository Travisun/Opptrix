import type { ChatToolStep } from './chatProgress'
import type { ReasoningSegment } from '../chat/reasoningTimeline'

export type { ReasoningSegment }

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
  /** 上游 prefix cache 命中 tokens；缺省表示未上报 */
  cachedPromptTokens?: number
}

export interface ChatContextUsage {
  usedTokens: number
  limitTokens: number
  remainingTokens: number
  modelRef: string
  estimated: boolean
  /** 0–100；Composer「上下文约 N%」 */
  usagePercent?: number
  /** 已整理过上下文（刷新仍在） */
  compacted?: boolean
  /** 最近一轮前缀缓存命中率 0–100；无上报则省略 */
  cacheHitPercent?: number
  cachedPromptTokens?: number
}

export type ReasoningEffort = 'low' | 'medium' | 'high'

/** 会话级 OpenAI 兼容采样参数（旧会话可能缺失，UI/请求侧默认温度 1、回复长度上限 32k） */
export interface SessionLlmParams {
  temperature?: number
  maxTokens?: number
  reasoningEffort?: ReasoningEffort
}

export const DEFAULT_SESSION_TEMPERATURE = 1
/** 与 agent output-budget ORDINARY_OUTPUT_TOKENS（普模默认 32k）对齐 */
export const DEFAULT_SESSION_MAX_TOKENS = 32_768
export const OUTPUT_TOKENS_64K = 65_536
export const OUTPUT_TOKENS_128K = 131_072
export const OUTPUT_TOKENS_384K = 393_216
/** 回复长度上限可选档位：32k / 64k / 128k / 384k */
export const MAX_OUTPUT_TOKENS_PRESETS = [
  DEFAULT_SESSION_MAX_TOKENS,
  OUTPUT_TOKENS_64K,
  OUTPUT_TOKENS_128K,
  OUTPUT_TOKENS_384K,
] as const

export function resolveSessionLlmParamsForUi(params?: SessionLlmParams | null): {
  temperature: number
  maxTokens: number
  reasoningEffort: ReasoningEffort | 'off'
} {
  return {
    temperature: params?.temperature ?? DEFAULT_SESSION_TEMPERATURE,
    maxTokens: params?.maxTokens ?? DEFAULT_SESSION_MAX_TOKENS,
    reasoningEffort: params?.reasoningEffort ?? 'off',
  }
}

export interface SessionMeta {
  id: string
  title: string
  createdAt: string
  updatedAt: string
  /** providerId:modelName */
  model?: string
  llmParams?: SessionLlmParams
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

export type MediaKind = 'text' | 'image' | 'pdf' | 'document' | 'video' | 'audio' | 'canvas' | 'mindmap' | 'web'

/** Optional print dimensions; ignored for fluid mode. Legacy preset may appear on old attachments. */
export type CanvasPageSpec =
  | { preset: string }
  | { widthMm: number; heightMm: number }
  | { widthPx: number; heightPx: number }

export interface CanvasAttachmentMeta {
  /** Default `fluid` (responsive Surface). `print` is optional / legacy. */
  mode: 'fluid' | 'print'
  /** Optional; ignored for fluid. May be present on legacy attachments. */
  page?: CanvasPageSpec
  pageCount?: number
}

export interface MindmapAttachmentMeta {
  rootId: string
}

/** 网页制品元数据（kind=web） */
export interface WebAttachmentMeta {
  entry?: string
  files?: string[]
}

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
  canvas?: CanvasAttachmentMeta
  mindmap?: MindmapAttachmentMeta
  web?: WebAttachmentMeta
  /** 前端乐观插入标记；服务端不会返回此字段 */
  optimistic?: boolean
  /** 前端上传进度 0–1；仅乐观项，服务端不会返回 */
  uploadProgress?: number
  /** 列表 API：是否已被会话 turns 引用（可选，仅 GET list 返回） */
  referenced?: boolean
}

/** GET /api/sessions/:id/attachments 列表项（含 referenced） */
export type SessionAttachmentListItem = ChatAttachmentMeta & { referenced: boolean }

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

/** UI 展示来源；缺省 = 正常气泡。模型侧仍按 role 进上下文。 */
export type ChatTurnOrigin = 'wake_resume'

export interface ChatDisplayMessage {
  role: 'user' | 'assistant'
  content: string
  toolsUsed?: string[]
  toolSteps?: ChatToolStep[]
  at: string
  usage?: TokenUsage
  usageEstimated?: boolean
  attachments?: ChatAttachmentMeta[]
  /** 整轮思考派生字符串（兼容旧读）；展示优先 reasoningSegments */
  reasoningContent?: string
  /** 结构化思考分段（竖轴时间线） */
  reasoningSegments?: ReasoningSegment[]
  /** 系统续跑/回调注入；UI 降展示；旧 turns 可能缺失 */
  origin?: ChatTurnOrigin
}

/** 续跑注入：状态条而非用户气泡（含旧数据「系统续跑」启发） */
export function isWakeResumeDisplayMessage(msg: {
  origin?: string
  role?: string
  content?: string
}): boolean {
  if (msg.origin === 'wake_resume') return true
  if (msg.role === 'user' && typeof msg.content === 'string' && msg.content.startsWith('系统续跑')) {
    return true
  }
  return false
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
