import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { resolveUserDataRoot } from '@opptrix/shared'
import type { ChatMessage } from './llm/provider.js'
import type { ChatToolStep } from './chat-progress.js'

export type { ChatToolStep }

const SESSIONS_DIR = path.join(resolveUserDataRoot(), 'sessions')

export interface SessionMeta {
  id: string
  title: string
  createdAt: string
  updatedAt: string
  /** providerId:modelName */
  model?: string
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

export type SessionContextRef = SessionForkContextRef | SessionSelectionContextRef

export interface SessionRecord extends SessionMeta {
  messages: ChatMessage[]
  /** UI-visible turns (user/assistant only) */
  turns: { role: 'user' | 'assistant'; content: string; toolsUsed?: string[]; toolSteps?: ChatToolStep[]; at: string }[]
  contextRef?: SessionContextRef | null
}

function ensureDir() {
  if (!fs.existsSync(SESSIONS_DIR)) fs.mkdirSync(SESSIONS_DIR, { recursive: true })
}

function sessionPath(id: string) {
  return path.join(SESSIONS_DIR, `${id}.json`)
}

function previewText(content: string, max = 72): string {
  const oneLine = content.replace(/\s+/g, ' ').trim()
  if (!oneLine) return '空消息'
  return oneLine.length <= max ? oneLine : `${oneLine.slice(0, max)}…`
}

function writeRecord(record: SessionRecord) {
  ensureDir()
  record.updatedAt = new Date().toISOString()
  const p = sessionPath(record.id)
  const tmp = `${p}.${process.pid}.${Date.now()}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(record, null, 2), 'utf8')
  fs.renameSync(tmp, p)
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

export class SessionStore {
  list(): SessionMeta[] {
    ensureDir()
    const files = fs.readdirSync(SESSIONS_DIR).filter(f => f.endsWith('.json'))
    const sessions: SessionMeta[] = []
    for (const f of files) {
      try {
        const raw = JSON.parse(fs.readFileSync(path.join(SESSIONS_DIR, f), 'utf8')) as SessionRecord
        sessions.push({
          id: raw.id,
          title: raw.title,
          createdAt: raw.createdAt,
          updatedAt: raw.updatedAt,
          model: raw.model,
        })
      } catch { /* skip corrupt */ }
    }
    return sessions.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  }

  get(id: string): SessionRecord | null {
    ensureDir()
    const p = sessionPath(id)
    if (!fs.existsSync(p)) return null
    const raw = JSON.parse(fs.readFileSync(p, 'utf8')) as SessionRecord
    return normalizeRecord(raw)
  }

  create(title = '新对话'): SessionRecord {
    ensureDir()
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
    const p = sessionPath(id)
    if (fs.existsSync(p)) fs.unlinkSync(p)
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
    // legacy sessions without turns
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
    if (!record.contextRef?.turns?.length) return false
    const anchorAt = record.contextRef.anchorAt
    return !(record.turns ?? []).some(t => t.at === anchorAt)
  }

  materializeContextRef(record: SessionRecord): SessionRecord {
    if (!record.contextRef?.turns?.length) return record

    const prefix = record.contextRef.turns
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
