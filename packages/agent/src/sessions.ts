import { randomUUID } from 'node:crypto'
import { getUserDataStore } from '@opptrix/user-store'
import type { ChatMessage } from './llm/provider.js'
import type { ChatToolStep } from './chat-progress.js'
import { SessionArchiveFolderStore } from './archive-folders.js'

export type { ChatToolStep }

const NAMESPACE = 'session'

export interface SessionMeta {
  id: string
  title: string
  createdAt: string
  updatedAt: string
  /** providerId:modelName */
  model?: string
  archivedAt?: string | null
  archiveFolderId?: string | null
}

export interface DisplayMessage {
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
  turns: { role: 'user' | 'assistant'; content: string; toolsUsed?: string[]; toolSteps?: ChatToolStep[]; at: string }[]
  contextRef?: SessionContextRef | null
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
    if ((m.role === 'user' || m.role === 'assistant') && m.content) {
      turns.push({
        role: m.role,
        content: String(m.content),
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
  const record: SessionRecord = {
    ...raw,
    turns: raw.turns ?? [],
    contextRef: raw.contextRef ?? null,
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
    archivedAt: raw.archivedAt ?? null,
    archiveFolderId: raw.archiveFolderId ?? null,
  }
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

  create(title = '新对话'): SessionRecord {
    const now = new Date().toISOString()
    const record: SessionRecord = {
      id: randomUUID(),
      title,
      createdAt: now,
      updatedAt: now,
      messages: [],
      turns: [],
      contextRef: null,
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

  toDisplayMessages(record: SessionRecord): DisplayMessage[] {
    if (record.turns?.length) {
      return record.turns.map(t => ({
        role: t.role,
        content: t.content,
        toolsUsed: t.toolsUsed,
        toolSteps: t.toolSteps,
        at: t.at,
      }))
    }
    const out: DisplayMessage[] = []
    for (const m of record.messages) {
      if ((m.role === 'user' || m.role === 'assistant') && m.content) {
        out.push({ role: m.role, content: m.content, at: record.updatedAt })
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
