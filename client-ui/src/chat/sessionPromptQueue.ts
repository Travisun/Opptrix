/**
 * 会话级提示词编排队列（对标 Codex：执行中可排队，完成后串行 drain）。
 * 持久化到 localStorage；权威 transcript 仍由服务端会话消息承担。
 */

import type { ChatAttachmentMeta } from '../types/chat'

export const PROMPT_QUEUE_STORAGE_KEY = 'opptrix-chat-prompt-queue-v1'
export const PROMPT_QUEUE_MAX_PER_SESSION = 20

export type QueuedPrompt = {
  id: string
  text: string
  attachmentIds?: string[]
  attachmentMetas?: ChatAttachmentMeta[]
  createdAt: number
}

export type EnqueueResult =
  | { ok: true; item: QueuedPrompt; items: QueuedPrompt[] }
  | { ok: false; reason: 'empty' | 'full'; items: QueuedPrompt[] }

type QueueStore = Record<string, QueuedPrompt[]>

function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `q_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
}

function isAttachmentMeta(raw: unknown): raw is ChatAttachmentMeta {
  if (!raw || typeof raw !== 'object') return false
  const o = raw as Record<string, unknown>
  return typeof o.id === 'string' && typeof o.name === 'string'
}

export function normalizeQueuedPrompt(raw: unknown): QueuedPrompt | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const text = typeof o.text === 'string' ? o.text.trim() : ''
  const id = typeof o.id === 'string' && o.id.trim() ? o.id.trim() : newId()
  const createdAt = typeof o.createdAt === 'number' && Number.isFinite(o.createdAt)
    ? o.createdAt
    : Date.now()
  const attachmentIds = Array.isArray(o.attachmentIds)
    ? o.attachmentIds.filter((x): x is string => typeof x === 'string' && Boolean(x.trim()))
    : undefined
  const attachmentMetas = Array.isArray(o.attachmentMetas)
    ? o.attachmentMetas.filter(isAttachmentMeta)
    : undefined
  if (!text && !(attachmentIds?.length)) return null
  return {
    id,
    text,
    createdAt,
    ...(attachmentIds?.length ? { attachmentIds } : {}),
    ...(attachmentMetas?.length ? { attachmentMetas } : {}),
  }
}

function normalizeStore(raw: unknown): QueueStore {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const out: QueueStore = {}
  for (const [sessionId, list] of Object.entries(raw as Record<string, unknown>)) {
    if (!sessionId || !Array.isArray(list)) continue
    const items = list
      .map(normalizeQueuedPrompt)
      .filter((x): x is QueuedPrompt => x != null)
      .slice(0, PROMPT_QUEUE_MAX_PER_SESSION)
    if (items.length) out[sessionId] = items
  }
  return out
}

function canUseLocalStorage(): boolean {
  try {
    return typeof globalThis.localStorage?.getItem === 'function'
      && typeof globalThis.localStorage?.setItem === 'function'
  } catch {
    return false
  }
}

export function readPromptQueueStore(): QueueStore {
  if (!canUseLocalStorage()) return {}
  try {
    const raw = localStorage.getItem(PROMPT_QUEUE_STORAGE_KEY)
    if (!raw) return {}
    return normalizeStore(JSON.parse(raw))
  } catch {
    return {}
  }
}

export function writePromptQueueStore(store: QueueStore): void {
  if (!canUseLocalStorage()) return
  try {
    const cleaned: QueueStore = {}
    for (const [sessionId, items] of Object.entries(store)) {
      if (!sessionId || !items.length) continue
      cleaned[sessionId] = items.slice(0, PROMPT_QUEUE_MAX_PER_SESSION)
    }
    localStorage.setItem(PROMPT_QUEUE_STORAGE_KEY, JSON.stringify(cleaned))
  } catch {
    /* quota / private mode */
  }
}

function mutateSession(
  sessionId: string,
  fn: (items: QueuedPrompt[]) => QueuedPrompt[],
): QueuedPrompt[] {
  const store = readPromptQueueStore()
  const next = fn([...(store[sessionId] ?? [])])
  if (next.length) store[sessionId] = next
  else delete store[sessionId]
  writePromptQueueStore(store)
  return next
}

export function listQueuedPrompts(sessionId: string): QueuedPrompt[] {
  if (!sessionId) return []
  return [...(readPromptQueueStore()[sessionId] ?? [])]
}

export function enqueueQueuedPrompt(
  sessionId: string,
  input: {
    text?: string
    attachmentIds?: string[]
    attachmentMetas?: ChatAttachmentMeta[]
  },
): EnqueueResult {
  const text = (input.text ?? '').trim()
  const attachmentIds = input.attachmentIds?.filter(Boolean) ?? []
  const attachmentMetas = input.attachmentMetas?.filter(m => attachmentIds.includes(m.id))
  const current = listQueuedPrompts(sessionId)
  if (!text && !attachmentIds.length) {
    return { ok: false, reason: 'empty', items: current }
  }
  if (current.length >= PROMPT_QUEUE_MAX_PER_SESSION) {
    return { ok: false, reason: 'full', items: current }
  }
  const item: QueuedPrompt = {
    id: newId(),
    text,
    createdAt: Date.now(),
    ...(attachmentIds.length ? { attachmentIds } : {}),
    ...(attachmentMetas?.length ? { attachmentMetas } : {}),
  }
  const items = mutateSession(sessionId, prev => [...prev, item])
  return { ok: true, item, items }
}

export function removeQueuedPrompt(sessionId: string, id: string): QueuedPrompt[] {
  return mutateSession(sessionId, prev => prev.filter(item => item.id !== id))
}

export function clearSessionPromptQueue(sessionId: string): void {
  if (!sessionId) return
  const store = readPromptQueueStore()
  if (!(sessionId in store)) return
  delete store[sessionId]
  writePromptQueueStore(store)
}

/** 将指定项移到队首（打断立即执行前调用） */
export function promoteQueuedPrompt(sessionId: string, id: string): QueuedPrompt[] {
  return mutateSession(sessionId, prev => {
    const idx = prev.findIndex(item => item.id === id)
    if (idx < 0) return prev
    const next = [...prev]
    const [item] = next.splice(idx, 1)
    if (!item) return prev
    next.unshift(item)
    return next
  })
}

export function shiftQueuedPrompt(sessionId: string): {
  item: QueuedPrompt | null
  items: QueuedPrompt[]
} {
  const current = listQueuedPrompts(sessionId)
  if (!current.length) return { item: null, items: current }
  const [item, ...rest] = current
  mutateSession(sessionId, () => rest)
  return { item: item ?? null, items: rest }
}

export function takeQueuedPromptById(sessionId: string, id: string): {
  item: QueuedPrompt | null
  items: QueuedPrompt[]
} {
  const current = listQueuedPrompts(sessionId)
  const item = current.find(x => x.id === id) ?? null
  if (!item) return { item: null, items: current }
  const items = removeQueuedPrompt(sessionId, id)
  return { item, items }
}

/** Drain 意图：Stop=none；自然结束/失败=auto；打断指定项=runItem */
export type DrainIntent =
  | { kind: 'auto' }
  | { kind: 'none' }
  | { kind: 'runItem'; itemId: string }

export function resolveDrainAction(
  intent: DrainIntent,
  opts: {
    /** 流结束后是否仍有 pending ask_user（不应续跑） */
    hasPendingUserPrompt: boolean
    /** 同会话是否已有新流在跑 */
    alreadyStreaming: boolean
  },
): { action: 'skip' } | { action: 'shift' } | { action: 'take'; itemId: string } {
  if (opts.alreadyStreaming) return { action: 'skip' }
  if (opts.hasPendingUserPrompt) return { action: 'skip' }
  if (intent.kind === 'none') return { action: 'skip' }
  if (intent.kind === 'runItem') return { action: 'take', itemId: intent.itemId }
  return { action: 'shift' }
}
