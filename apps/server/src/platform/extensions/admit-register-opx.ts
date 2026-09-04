import type {
  ExtensionRecord,
} from './types.js'
import {
  isDevSignatureBypassEnabled,
  resolveTrustedStorePublicKeys,
  verifySignature,
} from './store-signing.js'
import { readOpxSigningMaterial } from './parse-opx-manifest-from-zip.js'
import type { PlatformContext } from '../types.js'
import { parseOpxManifestFromZip } from './parse-opx-manifest-from-zip.js'

/**
 * Diagnostic: Ingress admit → parse .opx zip manifest → registerFromManifest.
 * Wave 58A: may store extracted entry source in memory for worker_js; never
 * eval/require extension code in the server process.
 * C3 / Selection A: system-extension product path is in-process Host contributions
 * (routes/pages/hooks → Gateway→Gate). `worker_js` remains experimental script
 * activation — not the model for system UI/HTTP plugins; no process isolation.
 * SF1: requires install-time `trusted: true` in opts (or body field forwarded by HTTP).
 */
export function admitRegisterOpx(
  platform: Pick<PlatformContext, 'ingress' | 'extensions' | 'info'>,
  buffer: Uint8Array | Buffer,
  opts?: { origin?: string; trusted?: boolean },
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
      /** True when the package Ed25519 signature was verified against a trusted key. */
      verified: boolean
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

  // Phase B store trust: verify the Ed25519 package signature when trusted
  // publisher keys are configured. FAIL-CLOSED in that mode; when no keys are
  // configured (local development), the install proceeds but is reported as
  // unverified. OPPTRIX_EXT_DEV=1 explicitly bypasses verification.
  let verified = false
  const devBypass = isDevSignatureBypassEnabled()
  if (!devBypass) {
    const trustedKeys = resolveTrustedStorePublicKeys()
    const material = readOpxSigningMaterial(buffer)
    if (trustedKeys.length > 0) {
      if (!material.ok) {
        return { ok: false, error: `signature check failed: ${material.error}` }
      }
      if (!material.signature) {
        return { ok: false, error: 'package is unsigned (SIGNATURE.ed25519 missing)' }
      }
      const anyValid = trustedKeys.some(
        (pem) => verifySignature(material.checksumsPayload, material.signature as Buffer, pem).ok,
      )
      if (!anyValid) {
        return { ok: false, error: 'package signature verification failed' }
      }
      verified = true
    } else if (!material.ok || !material.signature) {
      verified = false
    } else {
      // Signature present but no trusted keys configured — verify against the
      // package's own claim is meaningless; report unverified.
      verified = false
    }
  }

  const registered = platform.extensions.registerFromManifest(parsed.manifest, {
    trusted: opts?.trusted === true,
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
    verified: devBypass ? false : verified,
    extension,
    extensions: platform.extensions.list(),
    extensionsActive: platform.info().extensionsActive,
    ...(parsed.entryPath !== undefined ? { entryPath: parsed.entryPath } : {}),
  }
}
