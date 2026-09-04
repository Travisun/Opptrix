import type { PlatformContext } from '../types.js'
import { admitChat } from './admit-chat.js'

/**
 * Best-effort `admitChat` for the HTTP chat entry (observability only).
 * Empty text/sessionId → no-op. Throws and ok:false never gate chat —
 * Ingress ⊥ Inference.
 *
 * @returns true when admit returned ok; false when skipped, denied, or threw
 */
export function admitChatBestEffort(
  platform: Pick<PlatformContext, 'ingress' | 'rememberChatAdmit'>,
  raw: {
    text: string
    sessionId: string
    origin?: string
  },
): boolean {
  const text = typeof raw.text === 'string' ? raw.text.trim() : ''
  if (!text) return false

  const sessionId = typeof raw.sessionId === 'string' ? raw.sessionId.trim() : ''
  if (!sessionId) return false

  try {
    const result = admitChat(platform, {
      text,
      sessionId,
      origin: raw.origin ?? 'web.chat',
    })
    return result.ok
  } catch {
    return false
  }
}
