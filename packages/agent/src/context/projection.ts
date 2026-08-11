/**
 * Model-visible ContextProjection sidecar — never replaces canonical session messages.
 * Soft/micro/structured write this checkpoint; assembleModelView splices when valid.
 */

import { createHash } from 'node:crypto'
import { chatMessageContentToText } from '../content-parts.js'
import type { ChatMessage } from '../llm/provider.js'
import { repairToolCallSequences, tailMessagesForLlm } from '../llm/messages.js'
import {
  formatSessionMemoryForPrompt,
  type SessionMemory,
} from './session-memory.js'

export interface ContextProjection {
  schemaVersion: 1
  /**
   * Provider-visible prefix covering canonical[0:coveredCount].
   * Micro: truncated tool copies; memory: usually empty (sessionMemory injects summary).
   */
  messages: ChatMessage[]
  /** Canonical watermark; visible history = messages + canonical[coveredCount:] */
  coveredCount: number
  keepRecent: number
  /** Fingerprint of canonical[:coveredCount]; missing → fail-closed rebuild */
  coveredPrefixHash?: string
  projectionVersion: number
  updatedAt: string
}

function contentFingerprint(content: ChatMessage['content']): string {
  if (content == null) return ''
  if (typeof content === 'string') return content
  return chatMessageContentToText(content)
}

/** Short hash of canonical[:coveredCount] (role + content + tool_call_id). */
export function coveredPrefixHash(canonical: ChatMessage[], coveredCount: number): string {
  const n = Math.max(0, Math.min(coveredCount, canonical.length))
  const h = createHash('sha256')
  for (let i = 0; i < n; i++) {
    const m = canonical[i]
    h.update(m.role)
    h.update('\0')
    h.update(contentFingerprint(m.content))
    h.update('\0')
    h.update(m.tool_call_id ?? '')
    h.update('\0')
    if (m.tool_calls?.length) {
      for (const tc of m.tool_calls) {
        h.update(tc.id)
        h.update('\0')
      }
    }
    h.update('\n')
  }
  return h.digest('hex').slice(0, 16)
}

/**
 * Valid when coveredCount ∈ (0, canonical.length], hash matches, append-only OK.
 * Missing hash → invalid (fail-closed).
 */
export function projectionValid(
  projection: ContextProjection | null | undefined,
  canonical: ChatMessage[],
): boolean {
  if (!projection || projection.schemaVersion !== 1) return false
  const c = projection.coveredCount
  const n = canonical.length
  if (!Number.isFinite(c) || c <= 0 || c > n) return false
  if (!projection.coveredPrefixHash) return false
  return projection.coveredPrefixHash === coveredPrefixHash(canonical, c)
}

/** Splice: system + memory + prefix? + projection.messages + tail(canonical[covered:]). */
export function modelVisibleFromProjection(opts: {
  systemPrompt: string
  sessionMemory?: SessionMemory | null
  projection: ContextProjection
  canonical: ChatMessage[]
  contextPrefix?: ChatMessage[]
  keepRecent?: number
}): ChatMessage[] {
  const keepRecent = opts.keepRecent ?? opts.projection.keepRecent
  const out: ChatMessage[] = [{ role: 'system', content: opts.systemPrompt }]
  const memoryText = formatSessionMemoryForPrompt(opts.sessionMemory)
  if (memoryText) {
    out.push({ role: 'system', content: memoryText })
  }
  if (opts.contextPrefix?.length) {
    out.push(...opts.contextPrefix)
  }
  out.push(...opts.projection.messages)
  const suffix = opts.canonical.slice(opts.projection.coveredCount)
  out.push(...tailMessagesForLlm(suffix, keepRecent))
  return out
}

function nextProjectionVersion(prev?: ContextProjection | null): number {
  return (prev?.projectionVersion ?? 0) + 1
}

/**
 * Micro sidecar: projectedPrefix should be micro-compacted full array (or prefix);
 * stores projectedPrefix[0:cut] and hashes canonical[:cut].
 */
export function installMicroProjection(
  canonical: ChatMessage[],
  projectedMessages: ChatMessage[],
  keepRecent: number,
  prev?: ContextProjection | null,
): ContextProjection | null {
  const repaired = repairToolCallSequences(canonical)
  if (repaired.length <= keepRecent) return null
  const cut = repaired.length - keepRecent
  return {
    schemaVersion: 1,
    messages: projectedMessages.slice(0, cut),
    coveredCount: cut,
    keepRecent,
    coveredPrefixHash: coveredPrefixHash(repaired, cut),
    projectionVersion: nextProjectionVersion(prev),
    updatedAt: new Date().toISOString(),
  }
}

/**
 * Structured/memory sidecar: coveredCount = cut; projection.messages usually empty
 * (summary lives in sessionMemory).
 */
export function installMemoryProjection(
  canonical: ChatMessage[],
  keepRecent: number,
  prev?: ContextProjection | null,
  summaryMessages: ChatMessage[] = [],
): ContextProjection | null {
  const repaired = repairToolCallSequences(canonical)
  if (repaired.length <= keepRecent) return null
  const cut = repaired.length - keepRecent
  return {
    schemaVersion: 1,
    messages: summaryMessages,
    coveredCount: cut,
    keepRecent,
    coveredPrefixHash: coveredPrefixHash(repaired, cut),
    projectionVersion: nextProjectionVersion(prev),
    updatedAt: new Date().toISOString(),
  }
}
