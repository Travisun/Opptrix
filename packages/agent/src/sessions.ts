import { randomUUID } from 'node:crypto'
import { getUserDataStore } from '@opptrix/user-store'
import type { ChatMessage } from './llm/provider.js'
import { chatMessageContentToText } from './content-parts.js'
import type { ChatToolStep } from './chat-progress.js'
import type { TokenUsage } from './llm/token-usage.js'
import { SessionArchiveFolderStore } from './archive-folders.js'

import type { ChatAttachmentMeta } from './media-types.js'
import type { ExpertIcon } from '@opptrix/shared'

export type { ChatToolStep, ChatAttachmentMeta }

const NAMESPACE = 'session'

/** OpenAI 兼容会话级采样参数（未设字段走 LLM 默认：温度 1、max_tokens 4096） */
export type ReasoningEffort = 'low' | 'medium' | 'high'

export interface SessionLlmParams {
  temperature?: number
  maxTokens?: number
  /** 未设则请求体不带 reasoning_effort */
  reasoningEffort?: ReasoningEffort
}

export const DEFAULT_SESSION_TEMPERATURE = 1
export const DEFAULT_SESSION_MAX_TOKENS = 4096

export function normalizeSessionLlmParams(raw: unknown): SessionLlmParams | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined
  const o = raw as Record<string, unknown>
  const out: SessionLlmParams = {}
  if (typeof o.temperature === 'number' && Number.isFinite(o.temperature)) {
    out.temperature = Math.min(2, Math.max(0, o.temperature))
  }
  if (typeof o.maxTokens === 'number' && Number.isFinite(o.maxTokens) && o.maxTokens >= 1) {
    out.maxTokens = Math.min(1_000_000, Math.floor(o.maxTokens))
  }
  if (o.reasoningEffort === 'low' || o.reasoningEffort === 'medium' || o.reasoningEffort === 'high') {
    out.reasoningEffort = o.reasoningEffort
  }
  return out.temperature !== undefined || out.maxTokens !== undefined || out.reasoningEffort !== undefined
    ? out
    : undefined
}

/** 合并补丁；`reasoningEffort: null` 清除该字段 */
export function mergeSessionLlmParams(
  current: SessionLlmParams | undefined,
  patch: {
    temperature?: number
    maxTokens?: number
    reasoningEffort?: ReasoningEffort | null
  },
): SessionLlmParams | undefined {
  const next: SessionLlmParams = { ...(current ?? {}) }
  if (patch.temperature !== undefined) next.temperature = patch.temperature
  if (patch.maxTokens !== undefined) next.maxTokens = patch.maxTokens
  if (patch.reasoningEffort === null) delete next.reasoningEffort
  else if (patch.reasoningEffort !== undefined) next.reasoningEffort = patch.reasoningEffort
  return normalizeSessionLlmParams(next)
}

export interface SessionMeta {
  id: string
  title: string
  createdAt: string
  updatedAt: string
  /** providerId:modelName */
  model?: string
  /** 会话级 LLM 参数（旧会话可能缺失） */
  llmParams?: SessionLlmParams
  archivedAt?: string | null
  archiveFolderId?: string | null
  expertId?: string | null
  expertIcon?: ExpertIcon | null
  /** 会话累计用量（列表 meta 可含） */
  usageTotals?: TokenUsage
}

export interface CreateSessionOptions {
  title?: string
  expertId?: string | null
  expertIcon?: ExpertIcon | null
  /** 会话级技能专长快照（已消毒） */
  rolePersona?: string | null
  /** providerId:modelName；省略时可由 AgentEngine 填入当前 defaultModel */
  model?: string
}

export interface DisplayMessage {
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
  turns: DisplayMessage[]
}

export interface SessionSelectionContextRef {
  kind: 'selection'
  selectedText: string
  sourceMessageIndex: number
  sourceRole: 'user' | 'assistant'
  anchorAt: string
  preview: string
  turns: DisplayMessage[]
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

export interface SessionRecord extends SessionMeta {
  messages: ChatMessage[]
  /** UI-visible turns (user/assistant only) */
  turns: {
    role: 'user' | 'assistant'
    content: string
    toolsUsed?: string[]
    toolSteps?: ChatToolStep[]
    at: string
    usage?: TokenUsage
    usageEstimated?: boolean
    attachments?: ChatAttachmentMeta[]
  }[]
  contextRef?: SessionContextRef | null
  /**
   * 会话级 Layer1 技能专长快照。创建时从专家/默认研究员复制；之后与目录解耦。
   * 列表 meta 不返回此字段全文。
   */
  rolePersona?: string | null
  /**
   * 结构化会话工作记忆（压缩产物）。列表 meta 不返回；UI transcript 仍用 turns。
   */
  sessionMemory?: import('./context/session-memory.js').SessionMemory | null
}

function previewText(content: string, max = 72): string {
  const oneLine = content.replace(/\s+/g, ' ').trim()
  if (!oneLine) return '空消息'
  return oneLine.length <= max ? oneLine : `${oneLine.slice(0, max)}…`
}

let sessionPersistHook: ((record: SessionRecord) => void) | null = null
let sessionDeleteHook: ((sessionId: string) => void) | null = null

export function setSessionPersistHooks(hooks: {
  onPersist?: (record: SessionRecord) => void
  onDelete?: (sessionId: string) => void
}) {
  sessionPersistHook = hooks.onPersist ?? null
  sessionDeleteHook = hooks.onDelete ?? null
}

function writeRecord(record: SessionRecord) {
  record.updatedAt = new Date().toISOString()
  getUserDataStore().setDocument(NAMESPACE, record.id, record)
  sessionPersistHook?.(record)
}

function migrateTurns(record: SessionRecord): SessionRecord {
  if (record.turns?.length) return record

  const turns: SessionRecord['turns'] = []
  for (const m of record.messages) {
    if ((m.role === 'user' || m.role === 'assistant') && m.content != null) {
      turns.push({
        role: m.role,
        content: chatMessageContentToText(m.content),
        at: record.updatedAt,
      })
    }
  }
  if (!turns.length) return record

  record.turns = turns
  writeRecord(record)
  return record
}

function normalizeRecord(raw: SessionRecord): SessionRecord {
  const llmParams = normalizeSessionLlmParams(raw.llmParams)
  const record: SessionRecord = {
    ...raw,
    turns: raw.turns ?? [],
    contextRef: raw.contextRef ?? null,
    expertId: raw.expertId ?? null,
    expertIcon: raw.expertIcon ?? null,
    rolePersona: raw.rolePersona ?? null,
    sessionMemory: raw.sessionMemory ?? null,
    llmParams,
  }
  return migrateTurns(record)
}

function toMeta(raw: SessionRecord): SessionMeta {
  return {
    id: raw.id,
    title: raw.title,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
    model: raw.model,
    llmParams: raw.llmParams,
    archivedAt: raw.archivedAt ?? null,
    archiveFolderId: raw.archiveFolderId ?? null,
    expertId: raw.expertId ?? null,
    expertIcon: raw.expertIcon ?? null,
    usageTotals: raw.usageTotals,
  }
}

export function sessionToMeta(raw: SessionRecord): SessionMeta {
  return toMeta(raw)
}

function isArchived(record: SessionRecord): boolean {
  return Boolean(record.archivedAt)
}

export class SessionStore {
  private folderStore = new SessionArchiveFolderStore()

  listArchiveFolders() {
    return this.folderStore.ensureDefaults()
  }

  /** Active (non-archived) sessions for sidebar */
  listActive(): SessionMeta[] {
    return this.listAll().filter(s => !s.archivedAt)
  }

  /** @deprecated Use listActive — kept for compatibility */
  list(): SessionMeta[] {
    return this.listActive()
  }

  listAll(): SessionMeta[] {
    const sessions = getUserDataStore()
      .listDocuments<SessionRecord>(NAMESPACE)
      .map(toMeta)
    return sessions.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  }

  listArchivedGrouped(): Array<{ folder: import('./archive-folders.js').SessionArchiveFolder; sessions: SessionMeta[] }> {
    const folders = this.folderStore.ensureDefaults()
    const archived = this.listAll().filter(s => s.archivedAt)
    return folders.map(folder => ({
      folder,
      sessions: archived
        .filter(s => (s.archiveFolderId || 'other') === folder.id)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    })).filter(g => g.sessions.length > 0)
  }

  /** 归档侧栏：展示全部文件夹（含空文件夹） */
  listArchivedByFolderAll(): Array<{ folder: import('./archive-folders.js').SessionArchiveFolder; sessions: SessionMeta[] }> {
    const folders = this.folderStore.ensureDefaults()
    const archived = this.listAll().filter(s => s.archivedAt)
    return folders.map(folder => ({
      folder,
      sessions: archived
        .filter(s => (s.archiveFolderId || 'other') === folder.id)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    }))
  }

  createArchiveFolder(title: string) {
    return this.folderStore.create(title)
  }

  renameArchiveFolder(id: string, title: string) {
    return this.folderStore.rename(id, title)
  }

  deleteArchiveFolder(id: string): { ok: boolean; movedCount: number } {
    const folder = this.folderStore.get(id)
    if (!folder || folder.isDefault) return { ok: false, movedCount: 0 }
    let movedCount = 0
    for (const meta of this.listAll()) {
      if (!meta.archivedAt || (meta.archiveFolderId || 'other') !== id) continue
      const record = this.get(meta.id)
      if (!record) continue
      record.archiveFolderId = 'other'
      writeRecord(record)
      movedCount += 1
    }
    const ok = this.folderStore.delete(id)
    return { ok, movedCount }
  }

  clearArchiveFolder(id: string): { ok: boolean; deletedCount: number } {
    const folder = this.folderStore.get(id)
    if (!folder) return { ok: false, deletedCount: 0 }
    let deletedCount = 0
    for (const meta of this.listAll()) {
      if (!meta.archivedAt || (meta.archiveFolderId || 'other') !== id) continue
      this.delete(meta.id)
      deletedCount += 1
    }
    return { ok: true, deletedCount }
  }

  get(id: string): SessionRecord | null {
    const raw = getUserDataStore().getDocument<SessionRecord>(NAMESPACE, id)
    if (!raw) return null
    return normalizeRecord(raw)
  }

  create(opts?: string | CreateSessionOptions): SessionRecord {
    const normalized: CreateSessionOptions = typeof opts === 'string'
      ? { title: opts }
      : opts ?? {}
    const title = normalized.title?.trim() || '新对话'
    const now = new Date().toISOString()
    const model = normalized.model?.trim() || undefined
    const record: SessionRecord = {
      id: randomUUID(),
      title,
      createdAt: now,
      updatedAt: now,
      messages: [],
      turns: [],
      contextRef: null,
      expertId: normalized.expertId ?? null,
      expertIcon: normalized.expertIcon ?? null,
      rolePersona: normalized.rolePersona ?? null,
      ...(model ? { model } : {}),
    }
    writeRecord(record)
    return record
  }

  save(record: SessionRecord) {
    writeRecord(record)
  }

  delete(id: string) {
    getUserDataStore().deleteDocument(NAMESPACE, id)
    sessionDeleteHook?.(id)
  }

  archive(id: string, folderId: string): SessionRecord | null {
    const record = this.get(id)
    if (!record) return null
    const folder = this.folderStore.get(folderId) ?? this.folderStore.get('other')
    if (!folder) return null
    if (!isArchived(record)) {
      record.archivedAt = new Date().toISOString()
    }
    record.archiveFolderId = folder.id
    record.updatedAt = new Date().toISOString()
    writeRecord(record)
    return record
  }

  unarchive(id: string): SessionRecord | null {
    const record = this.get(id)
    if (!record || !isArchived(record)) return null
    record.archivedAt = null
    record.archiveFolderId = null
    writeRecord(record)
    return record
  }

  rename(id: string, title: string) {
    const record = this.get(id)
    if (!record) return null
    record.title = title.trim() || record.title
    this.save(record)
    return record
  }

  /** 更新会话级技能专长（调用方须已消毒） */
  updateRolePersona(id: string, rolePersona: string): SessionRecord | null {
    const record = this.get(id)
    if (!record) return null
    record.rolePersona = rolePersona
    this.save(record)
    return record
  }

  /** 更新会话级 OpenAI 兼容采样参数 */
  updateLlmParams(
    id: string,
    patch: {
      temperature?: number
      maxTokens?: number
      reasoningEffort?: ReasoningEffort | null
    },
  ): SessionRecord | null {
    const record = this.get(id)
    if (!record) return null
    record.llmParams = mergeSessionLlmParams(record.llmParams, patch)
    this.save(record)
    return record
  }

  toDisplayMessages(record: SessionRecord): DisplayMessage[] {
    if (record.turns?.length) {
      return record.turns.map(t => ({
        role: t.role,
        content: t.content,
        toolsUsed: t.toolsUsed,
        toolSteps: t.toolSteps,
        at: t.at,
        usage: t.usage,
        usageEstimated: t.usageEstimated,
        attachments: t.attachments,
      }))
    }
    const out: DisplayMessage[] = []
    for (const m of record.messages) {
      if ((m.role === 'user' || m.role === 'assistant') && m.content != null) {
        out.push({
          role: m.role,
          content: chatMessageContentToText(m.content),
          at: record.updatedAt,
        })
      }
    }
    return out
  }

  fork(source: SessionRecord, throughDisplayIndex: number): SessionRecord | null {
    const display = this.toDisplayMessages(source)
    if (throughDisplayIndex < 0 || throughDisplayIndex >= display.length) return null

    const anchor = display[throughDisplayIndex]
    if (anchor.role !== 'assistant') return null

    const now = new Date().toISOString()
    const baseTitle = source.title.trim() || '新对话'
    const record: SessionRecord = {
      id: randomUUID(),
      title: `研讨 · ${baseTitle.length > 24 ? `${baseTitle.slice(0, 24)}…` : baseTitle}`,
      createdAt: now,
      updatedAt: now,
      model: source.model,
      llmParams: source.llmParams,
      expertId: source.expertId ?? null,
      expertIcon: source.expertIcon ?? null,
      rolePersona: source.rolePersona ?? null,
      messages: [],
      turns: [],
      contextRef: {
        kind: 'fork',
        sourceSessionId: source.id,
        sourceSessionTitle: baseTitle,
        anchorIndex: throughDisplayIndex,
        anchorAt: anchor.at,
        preview: previewText(anchor.content),
        turns: [{
          role: 'assistant',
          content: anchor.content,
          toolsUsed: anchor.toolsUsed,
          at: anchor.at,
        }],
      },
    }
    writeRecord(record)
    return record
  }

  /**
   * 从指定 display turn 起截断会话（含该条及之后）。
   * `displayIndex` 必须指向 user 气泡；与 UI transcript 索引一致。
   * messages 按与 turns 对齐的 user / 最终 assistant（无 tool_calls）计数切开。
   */
  truncateFromDisplayIndex(id: string, displayIndex: number): SessionRecord | null {
    const record = this.get(id)
    if (!record) return null

    const display = this.toDisplayMessages(record)
    if (displayIndex < 0 || displayIndex >= display.length) return null
    if (display[displayIndex]!.role !== 'user') return null

    let displayCount = 0
    let messageCut = -1
    for (let i = 0; i < record.messages.length; i++) {
      const m = record.messages[i]!
      const isDisplayMsg = m.role === 'user'
        || (m.role === 'assistant' && !(m.tool_calls?.length))
      if (!isDisplayMsg) continue
      if (displayCount === displayIndex) {
        messageCut = i
        break
      }
      displayCount += 1
    }
    if (messageCut < 0) return null

    record.turns = (record.turns?.length ? record.turns : display).slice(0, displayIndex)
    record.messages = record.messages.slice(0, messageCut)
    record.sessionMemory = null
    this.save(record)
    return record
  }

  clearContextRef(id: string): SessionRecord | null {
    const record = this.get(id)
    if (!record) return null
    record.contextRef = null
    this.save(record)
    return record
  }

  setContextRef(id: string, contextRef: SessionContextRef | null): SessionRecord | null {
    const record = this.get(id)
    if (!record) return null
    record.contextRef = contextRef
    this.save(record)
    return record
  }

  shouldMaterializeContext(record: SessionRecord): boolean {
    const ref = record.contextRef
    if (!ref || ref.kind === 'article' || !ref.turns?.length) return false
    const anchorAt = ref.anchorAt
    return !(record.turns ?? []).some(t => t.at === anchorAt)
  }

  materializeContextRef(record: SessionRecord): SessionRecord {
    const ref = record.contextRef
    if (!ref || ref.kind === 'article' || !ref.turns?.length) return record

    const prefix = ref.turns
    record.turns = [
      ...prefix.map(t => ({
        role: t.role,
        content: t.content,
        toolsUsed: t.toolsUsed,
        at: t.at,
      })),
      ...(record.turns ?? []),
    ]
    const prefixMessages = prefix.map(t => ({ role: t.role, content: t.content }))
    record.messages = [...prefixMessages, ...record.messages]
    record.contextRef = null
    this.save(record)
    return record
  }
}
