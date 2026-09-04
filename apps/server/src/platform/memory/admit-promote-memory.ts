import type { PlatformContext } from '../types.js'
import type { DurableMemoryEntry, MemoryProvenance } from './types.js'

export type AdmitPromoteMemoryRaw = {
  sessionId: string
  kind: string
  content: string
  provenance?: MemoryProvenance | null
}

/**
 * Diagnostic: Ingress admit → memory.promote (requires provenance).
 * Proves Ingress ⊥ Inference (no chat / no gate submit / no compact rewrite).
 * Facade promote failure maps to ok:false (incl. provenance_required).
 */
export function admitPromoteMemory(
  platform: Pick<PlatformContext, 'ingress' | 'memory' | 'info'>,
  raw: AdmitPromoteMemoryRaw,
  opts?: { origin?: string },
):
  | {
      ok: true
      traceId: string
      origin: string
      id: string
      entry: DurableMemoryEntry
      memoryDurable: number
    }
  | { ok: false; error: string; denialCode?: string } {
  const sessionId =
    typeof raw?.sessionId === 'string' ? raw.sessionId.trim() : ''
  if (!sessionId) {
    return { ok: false, error: 'sessionId required' }
  }

  const kind = typeof raw?.kind === 'string' ? raw.kind.trim() : ''
  if (!kind) {
    return { ok: false, error: 'kind required' }
  }

  const content = typeof raw?.content === 'string' ? raw.content.trim() : ''
  if (!content) {
    return { ok: false, error: 'content required' }
  }

  const source =
    typeof raw?.provenance?.source === 'string'
      ? raw.provenance.source.trim()
      : ''
  if (!source) {
    return {
      ok: false,
      denialCode: 'provenance_required',
      error: 'provenance.source required',
    }
  }

  const origin =
    typeof opts?.origin === 'string' && opts.origin.trim()
      ? opts.origin.trim()
      : 'web.diagnostic'

  const admitted = platform.ingress.admit(origin, {
    text: 'platform.memory.promote',
    sessionId,
  })
  if (!admitted.ok) {
    return { ok: false, error: admitted.error }
  }

  const provenance: MemoryProvenance = { source }
  const at = raw.provenance?.at
  const ref = raw.provenance?.ref
  if (typeof at === 'string' && at.trim()) provenance.at = at.trim()
  if (typeof ref === 'string' && ref.trim()) provenance.ref = ref.trim()

  const promoted = platform.memory.promote({
    sessionId,
    kind,
    content,
    provenance,
  })
  if (!promoted.ok) {
    return {
      ok: false,
      error: promoted.error,
      ...(promoted.denialCode ? { denialCode: promoted.denialCode } : {}),
    }
  }

  const listed = platform.memory.listDurable(sessionId)
  const entry = listed.find((e) => e.id === promoted.id)
  if (!entry) {
    return { ok: false, error: 'promoted entry not found' }
  }

  return {
    ok: true,
    traceId: admitted.envelope.traceId,
    origin: admitted.envelope.origin,
    id: promoted.id,
    entry,
    memoryDurable: platform.info().memoryDurable,
  }
}
