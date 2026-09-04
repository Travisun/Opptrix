import type { ExtensionRecord } from './types.js'
import type { PlatformContext } from '../types.js'

/**
 * Diagnostic: Ingress admit → extensions.deactivate(id) (catalog entry kept, state → inactive).
 * Proves Ingress ⊥ Inference (no chat / no gate submit / no .opx / no code unload).
 */
export async function admitDeactivateExtension(
  platform: Pick<PlatformContext, 'ingress' | 'extensions' | 'info'>,
  id: string,
  opts?: { origin?: string },
): Promise<
  | {
      ok: true
      traceId: string
      origin: string
      extension: ExtensionRecord
      extensionsActive: number
    }
  | { ok: false; error: string }
> {
  const key = typeof id === 'string' ? id.trim() : ''
  if (!key) {
    return { ok: false, error: 'extension id required' }
  }

  const origin =
    typeof opts?.origin === 'string' && opts.origin.trim()
      ? opts.origin.trim()
      : 'web.diagnostic'

  const admitted = platform.ingress.admit(origin, {
    text: 'platform.extensions.deactivate',
  })
  if (!admitted.ok) {
    return { ok: false, error: admitted.error }
  }

  const deactivated = await platform.extensions.deactivate(key)
  if (!deactivated.ok) {
    return { ok: false, error: `extension not found: ${key}` }
  }

  const extension = platform.extensions.list().find((r) => r.id === key)
  if (!extension) {
    return { ok: false, error: 'deactivated extension not found' }
  }

  return {
    ok: true,
    traceId: admitted.envelope.traceId,
    origin: admitted.envelope.origin,
    extension,
    extensionsActive: platform.info().extensionsActive,
  }
}
