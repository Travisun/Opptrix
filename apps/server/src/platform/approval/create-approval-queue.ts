import { randomUUID } from 'node:crypto'
import type {
  ApprovalQueue,
  ApprovalRequest,
  ApprovalRequestInput,
  ApprovalRequestResult,
  ApprovalUserPromptResolveHandler,
} from './types.js'

const MAX_PENDING = 64

/** In-memory ApprovalQueue; rejects new requests when pending ≥ 64. */
export function createApprovalQueue(): ApprovalQueue {
  const byId = new Map<string, ApprovalRequest>()
  /** Insertion order of pending ids (FIFO for overflow reject count). */
  const pendingOrder: string[] = []
  /** Soft UserPrompt mirror (Wave 50A); null until late-bound. */
  let userPromptResolve: ApprovalUserPromptResolveHandler | null = null

  function countPending(): number {
    return pendingOrder.length
  }

  function removeFromPendingOrder(id: string): void {
    const idx = pendingOrder.indexOf(id)
    if (idx >= 0) pendingOrder.splice(idx, 1)
  }

  function notifyUserPromptResolve(
    id: string,
    sessionId: string,
    decision: { approved: boolean; note?: string },
  ): void {
    if (!userPromptResolve) return
    try {
      userPromptResolve({ id, sessionId, decision })
    } catch {
      /* swallow — approval path must never break on missing/broken prompt bridge */
    }
  }

  return {
    bindUserPromptResolve(handler: ApprovalUserPromptResolveHandler | null): void {
      userPromptResolve = handler
    },

    request(input: ApprovalRequestInput): ApprovalRequestResult {
      const sessionId = String(input?.sessionId ?? '').trim()
      if (!sessionId) {
        return { ok: false, error: 'sessionId required' }
      }
      const kind = String(input?.kind ?? '').trim()
      if (!kind) {
        return { ok: false, error: 'kind required' }
      }
      if (countPending() >= MAX_PENDING) {
        return { ok: false, error: `approval queue full (max ${MAX_PENDING} pending)` }
      }

      const customId =
        typeof input.id === 'string' ? input.id.trim() : ''
      if (customId && byId.has(customId)) {
        return { ok: false, error: 'duplicate approval id' }
      }
      const id = customId || randomUUID()
      const createdAt = new Date().toISOString()
      const row: ApprovalRequest = {
        id,
        sessionId,
        kind,
        status: 'pending',
        createdAt,
      }
      if (typeof input.title === 'string' && input.title.trim()) {
        row.title = input.title.trim()
      }
      if (input.meta && typeof input.meta === 'object' && !Array.isArray(input.meta)) {
        row.meta = { ...input.meta }
      }
      byId.set(id, row)
      pendingOrder.push(id)
      return { ok: true, id }
    },

    list(sessionId?: string): ApprovalRequest[] {
      const filter =
        sessionId === undefined ? null : String(sessionId ?? '').trim()
      const out: ApprovalRequest[] = []
      for (const id of pendingOrder) {
        const row = byId.get(id)
        if (!row || row.status !== 'pending') continue
        if (filter !== null && row.sessionId !== filter) continue
        out.push({
          ...row,
          meta: row.meta ? { ...row.meta } : undefined,
          decision: row.decision ? { ...row.decision } : undefined,
        })
      }
      return out
    },

    resolve(id: string, decision: { approved: boolean; note?: string }): boolean {
      const key = String(id ?? '').trim()
      if (!key) return false
      const row = byId.get(key)
      if (!row || row.status !== 'pending') return false
      row.status = 'resolved'
      row.decision = {
        approved: decision.approved === true,
        ...(typeof decision.note === 'string' && decision.note.trim()
          ? { note: decision.note.trim() }
          : {}),
      }
      row.resolvedAt = new Date().toISOString()
      removeFromPendingOrder(key)
      // Soft reverse mirror (Wave 50A): approval id ≡ promptId → UserPromptBridge
      notifyUserPromptResolve(key, row.sessionId, row.decision)
      return true
    },

    cancelSession(sessionId: string): number {
      const sid = String(sessionId ?? '').trim()
      if (!sid) return 0
      let n = 0
      const toCancel = [...pendingOrder]
      for (const id of toCancel) {
        const row = byId.get(id)
        if (!row || row.status !== 'pending') continue
        if (row.sessionId !== sid) continue
        row.status = 'cancelled'
        row.resolvedAt = new Date().toISOString()
        removeFromPendingOrder(id)
        n += 1
      }
      return n
    },
  }
}
