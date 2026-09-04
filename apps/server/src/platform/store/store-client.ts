/**
 * Phase B extension store client — registry protocol implementation
 * (protocol spec: docs/EXTENSION-STORE-PROTOCOL.md).
 *
 * Transport is injectable for tests (local mock registry). The production
 * base URL is the official registry constant; env override exists for
 * deploy-level mirroring only (never user-configurable per protocol P2).
 *
 * Install pipeline (fail-closed, spec §5):
 *   detail → version pick (approved + not revoked) → ABI compat →
 *   download (sha256 header check) → zip safety parse → Ed25519 verify
 *   (REQUIRED for store installs) → manifest id match → register → activate.
 */

import { createHash } from 'node:crypto'
import { PLATFORM_ABI_VERSION } from '../types.js'
import {
  isDevSignatureBypassEnabled,
  resolveTrustedStorePublicKeys,
  verifySignature,
} from '../extensions/store-signing.js'
import {
  parseOpxManifestFromZip,
  readOpxSigningMaterial,
} from '../extensions/parse-opx-manifest-from-zip.js'
import { admitRegisterOpx } from '../extensions/admit-register-opx.js'
import type { PlatformContext } from '../types.js'

/** Official registry base (protocol P2 — only this value, no user config). */
export const OFFICIAL_REGISTRY_BASE = 'https://registry.opptrix.org/v1'

export type StoreClientOptions = {
  /** Registry base URL. Defaults to official; tests inject a mock server. */
  baseUrl?: string
  /** Transport override (tests). Defaults to global fetch. */
  fetchImpl?: (url: string, init?: { method?: string; headers?: Record<string, string> }) => Promise<{
    ok: boolean
    status: number
    headers: Record<string, string>
    json: () => Promise<unknown>
    arrayBuffer: () => Promise<ArrayBuffer>
  }>
  timeoutMs?: number
}

export function resolveRegistryBase(env: NodeJS.ProcessEnv = process.env): string {
  // Deploy-level mirror override; never exposed as a user setting (spec P2).
  return env.OPPTRIX_STORE_REGISTRY_BASE?.trim() || OFFICIAL_REGISTRY_BASE
}

export type StoreExtensionSummary = {
  id: string
  name: string
  version: string
  publisher: string
  description?: string
  permissions?: string[]
  reviewLevel?: 'auto' | 'human'
  verifiedPublisher?: boolean
  incompatible?: boolean
}

export type StoreVersionInfo = {
  version: string
  sha256: string
  signatureKeyId?: string
  reviewState: 'pending' | 'approved' | 'rejected' | 'revoked'
  publishedAt: string
  revokedAt?: string | null
  revokeReason?: string | null
  downloadUrl: string
  abi?: string
  engines?: { opptrix?: string }
}

export type StoreDetail = StoreExtensionSummary & { versions: StoreVersionInfo[] }

export type StoreFetchError = Error & { status?: number; code?: string }

async function storeFetch(
  opts: StoreClientOptions,
  path: string,
  accept: 'json' | 'bytes',
): Promise<{ status: number; headers: Record<string, string>; body: unknown; bytes?: Buffer }> {
  const base = (opts.baseUrl ?? resolveRegistryBase()).replace(/\/$/, '')
  const url = base + path
  const doFetch = opts.fetchImpl ?? fetch
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 20_000)
  try {
    const resp = await doFetch(url, { headers: { accept: accept === 'json' ? 'application/json' : 'application/octet-stream' } })
    const headers: Record<string, string> = {}
    const h = resp.headers as unknown
    if (h && typeof (h as { forEach?: unknown }).forEach === 'function') {
      // WHATWG Headers — entries are NOT enumerable; iterate via forEach.
      ;(h as { forEach: (cb: (v: string, k: string) => void) => void }).forEach((v, k) => {
        headers[k.toLowerCase()] = v
      })
    } else if (h && typeof h === 'object') {
      for (const [k, v] of Object.entries(h as Record<string, unknown>)) {
        if (typeof v === 'string') headers[k.toLowerCase()] = v
      }
    }
    if (accept === 'bytes') {
      const buf = Buffer.from(await resp.arrayBuffer())
      return { status: resp.status, headers, body: null, bytes: buf }
    }
    const body = (await resp.json()) as unknown
    return { status: resp.status, headers, body }
  } finally {
    clearTimeout(timer)
  }
}

function storeError(status: number, body: unknown): StoreFetchError {
  const code = (body as { code?: string })?.code ?? 'registry_error'
  const message = (body as { message?: string; error?: string })?.message ??
    (body as { error?: string })?.error ?? `registry error: ${status}`
  const err = new Error(message) as StoreFetchError
  err.status = status
  err.code = code
  return err
}

export function createStoreClient(opts: StoreClientOptions = {}) {
  return {
    async search(params: { q?: string; category?: string; cursor?: string; limit?: number }): Promise<{
      total: number
      nextCursor?: string
      items: StoreExtensionSummary[]
    }> {
      const qs = new URLSearchParams()
      if (params.q) qs.set('q', params.q)
      if (params.category) qs.set('category', params.category)
      if (params.cursor) qs.set('cursor', params.cursor)
      if (params.limit) qs.set('limit', String(params.limit))
      qs.set('abi', PLATFORM_ABI_VERSION)
      const r = await storeFetch(opts, `/v1/extensions?${qs}`, 'json')
      if (r.status !== 200) throw storeError(r.status, r.body)
      const body = r.body as { total?: number; nextCursor?: string; items?: StoreExtensionSummary[] }
      return {
        total: body.total ?? 0,
        nextCursor: body.nextCursor,
        items: Array.isArray(body.items) ? body.items : [],
      }
    },

    async detail(id: string): Promise<StoreDetail> {
      const r = await storeFetch(opts, `/v1/extensions/${encodeURIComponent(id)}`, 'json')
      if (r.status !== 200) throw storeError(r.status, r.body)
      const body = r.body as StoreDetail
      return { ...body, versions: Array.isArray(body.versions) ? body.versions : [] }
    },

    async download(id: string, version: string): Promise<{ bytes: Buffer; sha256Header?: string; keyId?: string }> {
      const r = await storeFetch(
        opts,
        `/v1/extensions/${encodeURIComponent(id)}/${encodeURIComponent(version)}/download`,
        'bytes',
      )
      if (r.status !== 200 || !r.bytes) throw storeError(r.status, r.body)
      return {
        bytes: r.bytes,
        sha256Header: r.headers['x-opptrix-sha256'],
        keyId: r.headers['x-opptrix-signature-key-id'],
      }
    },

    async revocations(): Promise<Array<{ id: string; version: string; reason: string }>> {
      const r = await storeFetch(opts, '/v1/revocations', 'json')
      if (r.status !== 200) throw storeError(r.status, r.body)
      const body = r.body as { entries?: Array<{ id: string; version: string; reason: string }> }
      return Array.isArray(body.entries) ? body.entries : []
    },
  }
}

export type StoreInstallResult =
  | {
      ok: true
      id: string
      version: string
      verified: true
      activated: boolean
    }
  | { ok: false; error: string; code?: string }

function abiCompatible(manifestAbi: string | undefined): boolean {
  if (!manifestAbi) return true // pre-ABI packages stay installable (permissive read, fail-closed perms)
  const want = PLATFORM_ABI_VERSION.split('.').slice(0, 2).join('.')
  const got = manifestAbi.split('.').slice(0, 2).join('.')
  return want === got
}

/**
 * Full store install pipeline (spec §5). Store installs REQUIRE signature
 * verification — unlike local installs, no unverified fallback.
 */
export async function installFromStore(
  platform: PlatformContext,
  client: ReturnType<typeof createStoreClient>,
  params: { id: string; version?: string; autoActivate?: boolean },
): Promise<StoreInstallResult> {
  // 0. Store installs REQUIRE a configured trust anchor.
  if (!isDevSignatureBypassEnabled() && resolveTrustedStorePublicKeys().length === 0) {
    return {
      ok: false,
      code: 'no_trust_anchor',
      error: 'store installs require OPPTRIX_STORE_PUBLIC_KEY (trusted publisher key)',
    }
  }

  // 1. Detail + version pick.
  let detail
  try {
    detail = await client.detail(params.id)
  } catch (err) {
    return { ok: false, code: 'registry_unreachable', error: err instanceof Error ? err.message : String(err) }
  }
  const versionInfo = params.version
    ? detail.versions.find((v) => v.version === params.version)
    : [...detail.versions]
        .filter((v) => v.reviewState === 'approved')
        .sort((a, b) => (a.version < b.version ? 1 : -1))[0]
  if (!versionInfo) {
    // No installable version: distinguish revocation from plain absence.
    const anyRevoked = detail.versions.find((v) => v.reviewState === 'revoked' || v.revokedAt)
    if (anyRevoked) {
      return {
        ok: false,
        code: 'revoked',
        error: `version revoked: ${anyRevoked.revokeReason ?? 'unknown'}`,
      }
    }
    return { ok: false, code: 'not_found', error: `version not found: ${params.version ?? 'latest approved'}` }
  }
  if (versionInfo.reviewState === 'revoked' || versionInfo.revokedAt) {
    return { ok: false, code: 'revoked', error: `version revoked: ${versionInfo.revokeReason ?? 'unknown'}` }
  }
  if (versionInfo.reviewState !== 'approved') {
    return { ok: false, code: 'review_pending', error: `review state: ${versionInfo.reviewState}` }
  }

  // 2. Revocation list check (cross-check, belt & braces with reviewState).
  try {
    const revocations = await client.revocations()
    const hit = revocations.find((r) => r.id === params.id && r.version === versionInfo.version)
    if (hit) {
      return { ok: false, code: 'revoked', error: `revoked: ${hit.reason}` }
    }
  } catch {
    // Revocation endpoint unavailable → proceed (reviewState already checked).
  }

  // 3. ABI compat (registry metadata).
  const manifestAbi = versionInfo.abi
  if (manifestAbi && !abiCompatible(manifestAbi)) {
    return { ok: false, code: 'incompatible', error: `ABI ${manifestAbi} incompatible with host ${PLATFORM_ABI_VERSION}` }
  }

  // 4. Download + content hash check.
  let downloaded
  try {
    downloaded = await client.download(params.id, versionInfo.version)
  } catch (err) {
    return { ok: false, code: 'download_failed', error: err instanceof Error ? err.message : String(err) }
  }
  const actual = createHash('sha256').update(downloaded.bytes).digest('hex')
  if (downloaded.sha256Header && downloaded.sha256Header !== actual) {
    return { ok: false, code: 'hash_mismatch', error: 'downloaded package hash mismatch' }
  }

  // 5. Zip safety parse (existing constraints).
  const parsed = parseOpxManifestFromZip(downloaded.bytes)
  if (!parsed.ok) {
    return { ok: false, code: 'bad_package', error: parsed.error }
  }
  if (parsed.manifest.id !== params.id) {
    return { ok: false, code: 'id_mismatch', error: `manifest id ${parsed.manifest.id} != requested ${params.id}` }
  }

  // 6. Ed25519 verify — REQUIRED for store installs (no unverified fallback).
  const material = readOpxSigningMaterial(downloaded.bytes)
  if (!material.ok || !material.signature) {
    return { ok: false, code: 'unsigned', error: 'store package is unsigned (SIGNATURE.ed25519 missing)' }
  }
  const trustedKeys = resolveTrustedStorePublicKeys()
  const anyValid = trustedKeys.some(
    (pem) => verifySignature(material.checksumsPayload, material.signature as Buffer, pem).ok,
  )
  if (!anyValid) {
    return { ok: false, code: 'bad_signature', error: 'store package signature verification failed' }
  }

  // 7. Register (+ activate).
  const reg = admitRegisterOpx(platform, downloaded.bytes, { trusted: true, origin: 'store.install' })
  if (!reg.ok) {
    return { ok: false, code: 'register_failed', error: reg.error }
  }
  let activated = false
  if (params.autoActivate !== false) {
    const act = await platform.extensions.activate(reg.extension.id)
    activated = act.ok === true
    if (!act.ok) {
      return { ok: true, id: reg.extension.id, version: versionInfo.version, verified: true, activated: false }
    }
  }
  return {
    ok: true,
    id: reg.extension.id,
    version: versionInfo.version,
    verified: true,
    activated,
  }
}
