import type { PlatformContext } from '../types.js'
import type { Envelope, IngressPrincipal } from './types.js'

/**
 * Admit a chat-shaped envelope (`web.chat` by default).
 * Does not call AgentEngine / resume / HTTP handlers — Ingress ⊥ Inference.
 */
export function admitChat(
  platform: Pick<PlatformContext, 'ingress' | 'rememberChatAdmit'>,
  raw: {
    text: string
    sessionId: string
    origin?: string
    principal?: IngressPrincipal
  },
):
  | { ok: true; traceId: string; envelope: Envelope }
  | { ok: false; error: string } {
  const sessionId = typeof raw.sessionId === 'string' ? raw.sessionId.trim() : ''
  if (!sessionId) {
    return { ok: false, error: 'sessionId required' }
  }

  const text = typeof raw.text === 'string' ? raw.text.trim() : ''
  if (!text) {
    return { ok: false, error: 'text required' }
  }

  const origin =
    typeof raw.origin === 'string' && raw.origin.trim()
      ? raw.origin.trim()
      : 'web.chat'

  const admitted = platform.ingress.admit(origin, { text, sessionId })
  if (!admitted.ok) {
    return { ok: false, error: admitted.error }
  }

  const envelope: Envelope = { ...admitted.envelope }
  if (raw.principal) {
    envelope.principal = { ...raw.principal }
  }

  platform.rememberChatAdmit({
    traceId: envelope.traceId,
    sessionId:
      typeof envelope.sessionId === 'string' && envelope.sessionId.trim()
        ? envelope.sessionId.trim()
        : sessionId,
    origin: envelope.origin,
    at: new Date().toISOString(),
  })

  return {
    ok: true,
    traceId: envelope.traceId,
    envelope,
  }
}
