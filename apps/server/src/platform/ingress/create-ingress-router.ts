import { randomUUID } from 'node:crypto'
import type { Envelope, IngressRouter } from './types.js'

/** Build a minimal ingress admit router (no HTTP wiring). */
export function createIngressRouter(): IngressRouter {
  return {
    admit(origin, raw) {
      const text = typeof raw.text === 'string' ? raw.text.trim() : ''
      if (!text) {
        return { ok: false, error: 'empty text' }
      }
      const envelope: Envelope = {
        traceId: randomUUID(),
        origin: String(origin ?? ''),
        text,
      }
      const sessionId =
        typeof raw.sessionId === 'string' ? raw.sessionId.trim() : ''
      if (sessionId) {
        envelope.sessionId = sessionId
      }
      return { ok: true, envelope }
    },
  }
}
