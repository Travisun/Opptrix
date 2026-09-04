import type {
  ExtensionActivationMode,
  ExtensionRecord,
} from './types.js'
import type { PlatformContext } from '../types.js'

/**
 * Diagnostic: Ingress admit → extensions.activate(id) (already-registered only).
 * Proves Ingress ⊥ Inference (no chat / no gate submit).
 * Wave 55A: surfaces activation / hostBound when present on the record.
 * Wave 58A: worker_js loads entry source inside the host worker vm only.
 */
export async function admitActivateExtension(
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
      /** Present when the catalog record has an activation mode. */
      activation?: ExtensionActivationMode
      /** Present when worker_stub / worker_js activate bound the shared host worker. */
      hostBound?: boolean
      /** Present when worker_js successfully loaded entry source into the worker vm. */
      jsLoaded?: boolean
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
    text: 'platform.extensions.activate',
  })
  if (!admitted.ok) {
    return { ok: false, error: admitted.error }
  }

  const activated = await platform.extensions.activate(key)
  if (!activated.ok) {
    return {
      ok: false,
      error: activated.error ?? `extension not found: ${key}`,
    }
  }

  const extension = platform.extensions.list().find((r) => r.id === key)
  if (!extension) {
    return { ok: false, error: 'activated extension not found' }
  }

  return {
    ok: true,
    traceId: admitted.envelope.traceId,
    origin: admitted.envelope.origin,
    extension,
    extensionsActive: platform.info().extensionsActive,
    ...(extension.activation !== undefined
      ? { activation: extension.activation }
      : {}),
    ...(extension.hostBound !== undefined
      ? { hostBound: extension.hostBound }
      : {}),
    ...(extension.jsLoaded !== undefined
      ? { jsLoaded: extension.jsLoaded }
      : {}),
  }
}
