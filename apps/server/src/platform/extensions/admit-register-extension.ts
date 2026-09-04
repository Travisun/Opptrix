import type { ExtensionRecord } from './types.js'
import type { PlatformContext } from '../types.js'

export type AdmitRegisterExtensionRaw = {
  id?: unknown
  name?: unknown
  version?: unknown
  capabilities?: unknown
  /** Install-time trust (SF1); required true or opts.trusted. */
  trusted?: unknown
} & Record<string, unknown>

/**
 * Diagnostic: Ingress admit → extensions.registerFromManifest (in-memory only).
 * Proves Ingress ⊥ Inference (no chat / no gate submit / no .opx / no code load).
 * SF1: requires install-time trust (`trusted: true` in body or opts).
 */
export function admitRegisterExtension(
  platform: Pick<PlatformContext, 'ingress' | 'extensions' | 'info'>,
  raw: AdmitRegisterExtensionRaw,
  opts?: { origin?: string; trusted?: boolean },
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

  const body = raw && typeof raw === 'object' ? raw : {}
  const trusted = opts?.trusted === true || body.trusted === true
  const registered = platform.extensions.registerFromManifest(body, { trusted })
  if (!registered.ok) {
    return { ok: false, error: registered.error }
  }

  const id = typeof body.id === 'string' ? body.id.trim() : ''
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
