/**
 * Soft cap for session disk persistence — bounds SQLite document size without
 * wiping recent UI transcript. Triggered only for extreme sessions.
 *
 * Order: (1) shrink oldest tool payloads, (2) keep last N turns (+ aligned messages).
 * Preserves sessionMemory when present (summary of earlier context).
 */
import type { ChatMessage } from '../llm/provider.js'
import type { ChatToolStep } from '../chat-progress.js'

/** Fire soft-cap when UI turns exceed this count. */
export const SESSION_PERSIST_TURNS_TRIGGER = 500
/** Fire soft-cap when messages+turns JSON exceeds this (bytes). */
export const SESSION_PERSIST_JSON_BYTES_TRIGGER = 8 * 1024 * 1024
/** After trigger, keep this many most-recent turns for UI. */
export const SESSION_PERSIST_KEEP_RECENT_TURNS = 200
/** Stub length for truncated tool message / detail fields. */
const TOOL_FIELD_STUB_CHARS = 512

export type SoftCapSessionSlice = {
  messages: ChatMessage[]
  turns: Array<{
    role: 'user' | 'assistant'
    content: string
    toolsUsed?: string[]
    toolSteps?: ChatToolStep[]
    at: string
    usage?: unknown
    usageEstimated?: boolean
    attachments?: unknown
    reasoningContent?: string
    reasoningSegments?: unknown
  }>
  sessionMemory?: unknown
}

export type SoftCapResult = {
  applied: boolean
  reason: 'none' | 'turns' | 'bytes' | 'turns+bytes'
  trimmedTurns: number
  shrunkToolFields: number
}

function toolContentLength(content: ChatMessage['content']): number {
  if (content == null) return 0
  if (typeof content === 'string') return content.length
  try {
    return JSON.stringify(content).length
  } catch {
    return 0
  }
}

function stubToolContent(content: ChatMessage['content']): string {
  if (typeof content === 'string') {
    if (content.length <= TOOL_FIELD_STUB_CHARS) return content
    return `${content.slice(0, TOOL_FIELD_STUB_CHARS)}…[trimmed for disk soft-cap]`
  }
  if (content == null) return '[trimmed for disk soft-cap]'
  try {
    const s = JSON.stringify(content)
    if (s.length <= TOOL_FIELD_STUB_CHARS) return s
    return `${s.slice(0, TOOL_FIELD_STUB_CHARS)}…[trimmed for disk soft-cap]`
  } catch {
    return '[trimmed for disk soft-cap]'
  }
}

function shrinkToolStep(step: ChatToolStep): { step: ChatToolStep; changed: boolean } {
  let changed = false
  const next = { ...step }
  if (next.resultDetail && next.resultDetail.length > TOOL_FIELD_STUB_CHARS) {
    next.resultDetail = `${next.resultDetail.slice(0, TOOL_FIELD_STUB_CHARS)}…[trimmed]`
    changed = true
  }
  if (next.argsDetail && next.argsDetail.length > TOOL_FIELD_STUB_CHARS) {
    next.argsDetail = `${next.argsDetail.slice(0, TOOL_FIELD_STUB_CHARS)}…[trimmed]`
    changed = true
  }
  if (next.thinking && next.thinking.length > TOOL_FIELD_STUB_CHARS) {
    next.thinking = `${next.thinking.slice(0, TOOL_FIELD_STUB_CHARS)}…[trimmed]`
    changed = true
  }
  return { step: next, changed }
}

/** Rough UTF-8 byte size of the heavy persist payload (messages + turns). */
export function estimateSessionPersistBytes(record: SoftCapSessionSlice): number {
  try {
    return Buffer.byteLength(
      JSON.stringify({ messages: record.messages, turns: record.turns }),
      'utf8',
    )
  } catch {
    return Number.MAX_SAFE_INTEGER
  }
}

function isDisplayMessage(m: ChatMessage): boolean {
  return m.role === 'user' || (m.role === 'assistant' && !(m.tool_calls?.length))
}

/** Message index of the first kept display turn (aligned with turns[keepFrom]). */
function messageIndexForTurnKeepFrom(
  messages: ChatMessage[],
  keepFromTurnIndex: number,
): number {
  if (keepFromTurnIndex <= 0) return 0
  let displayCount = 0
  for (let i = 0; i < messages.length; i++) {
    if (!isDisplayMessage(messages[i]!)) continue
    if (displayCount === keepFromTurnIndex) return i
    displayCount += 1
  }
  // Fewer display messages than turns — keep a proportional tail of messages.
  const ratio = messages.length / Math.max(1, displayCount || 1)
  return Math.max(0, Math.floor(keepFromTurnIndex * ratio))
}

/**
 * Mutates record in place when over soft thresholds.
 * Returns what was applied (for tests / observability).
 */
export function applySessionPersistSoftCap(record: SoftCapSessionSlice): SoftCapResult {
  const turns = record.turns ?? []
  const messages = record.messages ?? []
  const overTurns = turns.length > SESSION_PERSIST_TURNS_TRIGGER

  // Cheap gate: normal sessions skip JSON sizing on every save.
  let overBytes = false
  if (!overTurns) {
    const likelyLarge = turns.length >= 100 || messages.length >= 80
    if (likelyLarge) {
      overBytes = estimateSessionPersistBytes(record) > SESSION_PERSIST_JSON_BYTES_TRIGGER
    }
  } else {
    overBytes = estimateSessionPersistBytes(record) > SESSION_PERSIST_JSON_BYTES_TRIGGER
  }

  if (!overTurns && !overBytes) {
    return { applied: false, reason: 'none', trimmedTurns: 0, shrunkToolFields: 0 }
  }

  const reason: SoftCapResult['reason'] =
    overTurns && overBytes ? 'turns+bytes' : overTurns ? 'turns' : 'bytes'

  let shrunkToolFields = 0
  const keepFrom = Math.max(0, turns.length - SESSION_PERSIST_KEEP_RECENT_TURNS)

  // Phase 1: shrink tool payloads outside the recent window (oldest first).
  if (Array.isArray(record.messages) && record.messages.length) {
    const msgKeepFrom = messageIndexForTurnKeepFrom(record.messages, keepFrom)
    for (let i = 0; i < msgKeepFrom; i++) {
      const m = record.messages[i]
      if (!m || m.role !== 'tool') continue
      if (toolContentLength(m.content) <= TOOL_FIELD_STUB_CHARS) continue
      m.content = stubToolContent(m.content)
      shrunkToolFields += 1
    }
  }

  for (let i = 0; i < keepFrom && i < turns.length; i++) {
    const turn = turns[i]
    if (!turn?.toolSteps?.length) continue
    const nextSteps: ChatToolStep[] = []
    let changed = false
    for (const step of turn.toolSteps) {
      const r = shrinkToolStep(step)
      nextSteps.push(r.step)
      if (r.changed) {
        changed = true
        shrunkToolFields += 1
      }
    }
    if (changed) turn.toolSteps = nextSteps
  }

  // If still over byte budget after shrinking old tools, also stub tool msgs in recent window
  // (keep UI turn text intact).
  if (estimateSessionPersistBytes(record) > SESSION_PERSIST_JSON_BYTES_TRIGGER) {
    for (const m of record.messages ?? []) {
      if (m.role !== 'tool') continue
      if (toolContentLength(m.content) <= TOOL_FIELD_STUB_CHARS) continue
      m.content = stubToolContent(m.content)
      shrunkToolFields += 1
    }
    for (const turn of turns) {
      if (!turn.toolSteps?.length) continue
      turn.toolSteps = turn.toolSteps.map(step => {
        const r = shrinkToolStep(step)
        if (r.changed) shrunkToolFields += 1
        return r.step
      })
    }
  }

  let trimmedTurns = 0
  if (turns.length > SESSION_PERSIST_KEEP_RECENT_TURNS) {
    const drop = turns.length - SESSION_PERSIST_KEEP_RECENT_TURNS
    const msgCut = messageIndexForTurnKeepFrom(record.messages ?? [], drop)
    record.turns = turns.slice(drop)
    record.messages = (record.messages ?? []).slice(msgCut)
    trimmedTurns = drop
    // Keep sessionMemory — it is the durable summary of dropped history.
  }

  return { applied: true, reason, trimmedTurns, shrunkToolFields }
}
