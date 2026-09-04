/**
 * Ed25519 signing for .opx packages (Phase B store foundation).
 *
 * Deterministic signing contract:
 *   1. CHECKSUMS.sha256 lists `sha256  <entryName>` lines for every file in
 *      the .opx (sorted by entry name) — produced by opptrix-ext pack.
 *   2. SIGNATURE.ed25519 contains the raw 64-byte Ed25519 signature over the
 *      UTF-8 bytes of CHECKSUMS.sha256.
 *   3. Verification: rebuild the CHECKSUMS payload from the zip entries, then
 *      verify the signature against the trusted public key(s).
 *
 * Trust model (Phase B):
 *   - Official store packages: signed by the official publisher key; the
 *     official public key ships with the server (env / embedded).
 *   - Local development: OPPTRIX_EXT_DEV=1 skips verification entirely.
 *   - Enterprise: additional trusted keys may be configured via env.
 *
 * Signature verification is FAIL-CLOSED: production installs without a
 * verifiable signature are rejected unless dev mode is explicitly enabled.
 */

import {
  createHash,
  generateKeyPairSync,
  sign as edSign,
  verify as edVerify,
  createPrivateKey,
  createPublicKey,
  KeyObject,
} from 'node:crypto'

export type StoreKeyPair = {
  /** PEM-encoded private key (publisher-side only; never ship). */
  privateKeyPem: string
  /** PEM-encoded public key (embeds into server / clients). */
  publicKeyPem: string
}

/** Generate a publisher Ed25519 keypair (one per publisher). */
export function generatePublisherKeyPair(): StoreKeyPair {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519')
  return {
    privateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
  }
}

/** Build the deterministic CHECKSUMS.sha256 payload from sorted entries. */
export function buildChecksumsPayload(entries: Array<{ name: string; data: Buffer }>): string {
  const sorted = [...entries].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
  const lines = sorted.map(({ name, data }) => `${createHash('sha256').update(data).digest('hex')}  ${name}`)
  return lines.join('\n') + (lines.length > 0 ? '\n' : '')
}

/** Sign the CHECKSUMS payload with a publisher private key (PEM). */
export function signChecksums(checksumsPayload: string, privateKeyPem: string): Buffer {
  const key = createPrivateKey(privateKeyPem)
  if (key.asymmetricKeyType !== 'ed25519') {
    throw new Error('publisher key must be Ed25519')
  }
  return edSign(null, Buffer.from(checksumsPayload, 'utf8'), key)
}

export type VerifyResult =
  | { ok: true; algorithm: 'ed25519' }
  | { ok: false; reason: 'bad_signature' | 'bad_key' | 'missing_inputs' }

/** Verify SIGNATURE.ed25519 against the CHECKSUMS payload and a trusted key. */
export function verifySignature(
  checksumsPayload: string,
  signature: Buffer,
  trustedPublicKeyPem: string,
): VerifyResult {
  if (!checksumsPayload || signature.length === 0 || !trustedPublicKeyPem) {
    return { ok: false, reason: 'missing_inputs' }
  }
  let publicKey: KeyObject
  try {
    publicKey = createPublicKey(trustedPublicKeyPem)
  } catch {
    return { ok: false, reason: 'bad_key' }
  }
  if (publicKey.asymmetricKeyType !== 'ed25519') {
    return { ok: false, reason: 'bad_key' }
  }
  const ok = edVerify(null, Buffer.from(checksumsPayload, 'utf8'), publicKey, signature)
  return ok ? { ok: true, algorithm: 'ed25519' } : { ok: false, reason: 'bad_signature' }
}

/** Trusted public keys for install-time verification (Phase B). */
export function resolveTrustedStorePublicKeys(env: NodeJS.ProcessEnv = process.env): string[] {
  const keys: string[] = []
  const official = env.OPPTRIX_STORE_PUBLIC_KEY?.trim()
  if (official) keys.push(official)
  const extra = env.OPPTRIX_STORE_PUBLIC_KEYS_EXTRA?.trim()
  if (extra) {
    for (const pem of extra.split('---END PUBLIC KEY---')) {
      const trimmed = (pem + '---END PUBLIC KEY---').trim()
      if (trimmed.startsWith('-----BEGIN PUBLIC KEY-----')) keys.push(trimmed)
    }
  }
  return keys
}

/** Dev mode skips signature verification (explicit env, never default). */
export function isDevSignatureBypassEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.OPPTRIX_EXT_DEV === '1'
}
