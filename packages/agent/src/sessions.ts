import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { randomUUID } from 'node:crypto'
import type { ChatMessage } from './llm/provider.js'

const SESSIONS_DIR = path.join(os.homedir(), '.a_stock_layer', 'sessions')

export interface SessionMeta {
  id: string
  title: string
  createdAt: string
  updatedAt: string
  /** providerId:modelName */
  model?: string
}

export interface SessionRecord extends SessionMeta {
  messages: ChatMessage[]
  /** UI-visible turns (user/assistant only) */
  turns: { role: 'user' | 'assistant'; content: string; toolsUsed?: string[]; at: string }[]
}

export interface DisplayMessage {
  role: 'user' | 'assistant'
  content: string
  toolsUsed?: string[]
  at: string
}

function ensureDir() {
  if (!fs.existsSync(SESSIONS_DIR)) fs.mkdirSync(SESSIONS_DIR, { recursive: true })
}

function sessionPath(id: string) {
  return path.join(SESSIONS_DIR, `${id}.json`)
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
    return { ...raw, turns: raw.turns ?? [] }
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
    }
    fs.writeFileSync(sessionPath(record.id), JSON.stringify(record, null, 2))
    return record
  }

  save(record: SessionRecord) {
    ensureDir()
    record.updatedAt = new Date().toISOString()
    fs.writeFileSync(sessionPath(record.id), JSON.stringify(record, null, 2))
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
}
