import type { ExtensionRecord } from './types.js'
import type { PlatformContext } from '../types.js'

export type AdmitRegisterExtensionRaw = {
  id?: unknown
  name?: unknown
  version?: unknown
  capabilities?: unknown
} & Record<string, unknown>

/**
 * Diagnostic: Ingress admit → extensions.registerFromManifest (in-memory only).
 * Proves Ingress ⊥ Inference (no chat / no gate submit / no .opx / no code load).
 */
export function admitRegisterExtension(
  platform: Pick<PlatformContext, 'ingress' | 'extensions' | 'info'>,
  raw: AdmitRegisterExtensionRaw,
  opts?: { origin?: string },
):
  | {
      ok: true
      traceId: string
      origin: string
      extension: ExtensionRecord
      extensions: ExtensionRecord[]
      extensionsActive: number
    }
  | { ok: false; error: string } {
  const origin =
    typeof opts?.origin === 'string' && opts.origin.trim()
      ? opts.origin.trim()
      : 'web.diagnostic'

  const admitted = platform.ingress.admit(origin, {
    text: 'platform.extensions.register',
  })
  if (!admitted.ok) {
    return { ok: false, error: admitted.error }
  }

  const registered = platform.extensions.registerFromManifest(
    raw && typeof raw === 'object' ? raw : {},
  )
  if (!registered.ok) {
    return { ok: false, error: registered.error }
  }

  const id = typeof raw?.id === 'string' ? raw.id.trim() : ''
  const extension = platform.extensions.list().find((r) => r.id === id)
  if (!extension) {
    return { ok: false, error: 'registered extension not found' }
  }

  return {
    ok: true,
    traceId: admitted.envelope.traceId,
    origin: admitted.envelope.origin,
    extension,
    extensions: platform.extensions.list(),
    extensionsActive: platform.info().extensionsActive,
  }
}
