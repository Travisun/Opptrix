import type { ExtensionRecord } from './types.js'
import type { PlatformContext } from '../types.js'
import { parseOpxManifestFromZip } from './parse-opx-manifest-from-zip.js'

/**
 * Diagnostic: Ingress admit → parse .opx zip manifest → registerFromManifest.
 * Wave 58A: may store extracted entry source in memory for worker_js; never
 * eval/require extension code in the server process.
 */
export function admitRegisterOpx(
  platform: Pick<PlatformContext, 'ingress' | 'extensions' | 'info'>,
  buffer: Uint8Array | Buffer,
  opts?: { origin?: string },
):
  | {
      ok: true
      traceId: string
      origin: string
      extension: ExtensionRecord
      extensions: ExtensionRecord[]
      extensionsActive: number
      /** Present when entry JS was extracted from the zip (worker_js). */
      entryPath?: string
    }
  | { ok: false; error: string } {
  const origin =
    typeof opts?.origin === 'string' && opts.origin.trim()
      ? opts.origin.trim()
      : 'web.diagnostic'

  const admitted = platform.ingress.admit(origin, {
    text: 'platform.extensions.registerOpx',
  })
  if (!admitted.ok) {
    return { ok: false, error: admitted.error }
  }

  const parsed = parseOpxManifestFromZip(buffer)
  if (!parsed.ok) {
    return { ok: false, error: parsed.error }
  }

  const registered = platform.extensions.registerFromManifest(parsed.manifest, {
    ...(parsed.entrySource !== undefined
      ? { entrySource: parsed.entrySource }
      : {}),
  })
  if (!registered.ok) {
    return { ok: false, error: registered.error }
  }

  const id = parsed.manifest.id.trim()
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
    ...(parsed.entryPath !== undefined ? { entryPath: parsed.entryPath } : {}),
  }
}
