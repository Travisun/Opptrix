import { randomUUID } from 'node:crypto'
import type { CheckpointListItem, CheckpointLatest, CheckpointStore } from './types.js'

const MAX_PER_SESSION = 32

type StoredCheckpoint = {
  id: string
  sessionId: string
  at: string
  payload: Record<string, unknown>
}

/** In-memory checkpoint store; drops oldest when a session exceeds 32. */
export function createCheckpointStore(): CheckpointStore {
  const byId = new Map<string, StoredCheckpoint>()
  const orderBySession = new Map<string, string[]>()

  return {
    save(sessionId, payload) {
      const sid = String(sessionId ?? '').trim()
      const id = randomUUID()
      const at = new Date().toISOString()
      const order = orderBySession.get(sid) ?? []
      order.push(id)
      while (order.length > MAX_PER_SESSION) {
        const oldest = order.shift()
        if (oldest) byId.delete(oldest)
      }
      orderBySession.set(sid, order)
      byId.set(id, {
        id,
        sessionId: sid,
        at,
        payload: { ...payload },
      })
      return { id }
    },

    list(sessionId) {
      const sid = String(sessionId ?? '').trim()
      const order = orderBySession.get(sid) ?? []
      const out: CheckpointListItem[] = []
      for (const id of order) {
        const row = byId.get(id)
        if (row) out.push({ id: row.id, at: row.at })
      }
      return out
    },

    get(id) {
      const key = String(id ?? '').trim()
      if (!key) return null
      const row = byId.get(key)
      if (!row) return null
      return { ...row.payload }
    },

    latest(sessionId) {
      const sid = String(sessionId ?? '').trim()
      if (!sid) return null
      const order = orderBySession.get(sid)
      if (!order || order.length === 0) return null
      const newestId = order[order.length - 1]
      if (!newestId) return null
      const row = byId.get(newestId)
      if (!row) return null
      const out: CheckpointLatest = {
        id: row.id,
        at: row.at,
        payload: { ...row.payload },
      }
      return out
    },
  }
}
