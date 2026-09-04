/**
 * Wave 49A: validate .opx zip + extract root manifest JSON only.
 * Wave 58A: optionally extract a single allowlisted entry JS into an in-memory string
 * (never writes to disk, never eval/require/imports entrypoint code in this process).
 */
import { inflateRawSync } from 'node:zlib'
import type {
  ExtensionActivationMode,
  ExtensionManifest,
  ExtensionPermission,
} from './types.js'

export const OPX_ZIP_MAX_BYTES = 2 * 1024 * 1024
export const OPX_MANIFEST_MAX_BYTES = 64 * 1024
/** Cap for extracted entry JS source (Wave 58A). */
export const OPX_ENTRY_SOURCE_MAX_BYTES = 256 * 1024

const EOCD_SIG = 0x06054b50
const CD_SIG = 0x02014b50
const LF_SIG = 0x04034b50

const ROOT_MANIFEST_NAMES = ['manifest.json', 'opx.manifest.json'] as const
const DEFAULT_ENTRY_CANDIDATES = ['index.js', 'dist/host/index.js'] as const

/** Path keys stripped before registerFromManifest (host never sees them as load paths). */
const STRIP_PATH_KEYS = [
  'sourcePath',
  'path',
  'file',
  'entry',
  'main',
  'module',
  'script',
  'bundle',
  'opxPath',
  'packagePath',
] as const

export type ParseOpxManifestResult =
  | {
      ok: true
      manifest: ExtensionManifest
      /** UTF-8 source of allowlisted entry JS when present (worker_js). */
      entrySource?: string
      /** Normalized zip-relative path that entrySource came from. */
      entryPath?: string
    }
  | { ok: false; error: string }

type ZipEntry = {
  name: string
  method: number
  flags: number
  compressedSize: number
  uncompressedSize: number
  localHeaderOffset: number
}

function hasPathTraversal(name: string): boolean {
  const n = name.replace(/\\/g, '/')
  if (n.startsWith('/') || n.includes('\0')) return true
  for (const part of n.split('/')) {
    if (part === '..') return true
  }
  return false
}

/**
 * Relative root path without `..`, absolute, or drive letters.
 * Leading `./` is normalized away. Returns null when unsafe.
 */
export function normalizeSafeEntryPath(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  let n = raw.replace(/\\/g, '/').trim()
  if (!n || n.includes('\0')) return null
  while (n.startsWith('./')) n = n.slice(2)
  if (!n || n.startsWith('/') || /^[a-zA-Z]:/.test(n)) return null
  if (hasPathTraversal(n)) return null
  if (n.endsWith('/')) return null
  return n
}

function findEocdOffset(buf: Buffer): number {
  const maxScan = Math.min(buf.length, 22 + 0xffff)
  const start = buf.length - 22
  const end = buf.length - maxScan
  for (let i = start; i >= end; i--) {
    if (buf.readUInt32LE(i) === EOCD_SIG) return i
  }
  return -1
}

function readCentralDirectory(buf: Buffer):
  | { ok: true; entries: ZipEntry[] }
  | { ok: false; error: string } {
  const eocd = findEocdOffset(buf)
  if (eocd < 0) return { ok: false, error: 'invalid zip: missing end of central directory' }
  if (eocd + 22 > buf.length) {
    return { ok: false, error: 'invalid zip: truncated end of central directory' }
  }

  const entryCount = buf.readUInt16LE(eocd + 10)
  const cdSize = buf.readUInt32LE(eocd + 12)
  const cdOffset = buf.readUInt32LE(eocd + 16)
  if (cdOffset + cdSize > buf.length) {
    return { ok: false, error: 'invalid zip: central directory out of bounds' }
  }

  const entries: ZipEntry[] = []
  let pos = cdOffset
  const cdEnd = cdOffset + cdSize

  for (let i = 0; i < entryCount; i++) {
    if (pos + 46 > cdEnd) {
      return { ok: false, error: 'invalid zip: truncated central directory entry' }
    }
    if (buf.readUInt32LE(pos) !== CD_SIG) {
      return { ok: false, error: 'invalid zip: bad central directory signature' }
    }
    const flags = buf.readUInt16LE(pos + 8)
    const method = buf.readUInt16LE(pos + 10)
    const compressedSize = buf.readUInt32LE(pos + 20)
    const uncompressedSize = buf.readUInt32LE(pos + 24)
    const nameLen = buf.readUInt16LE(pos + 28)
    const extraLen = buf.readUInt16LE(pos + 30)
    const commentLen = buf.readUInt16LE(pos + 32)
    const localHeaderOffset = buf.readUInt32LE(pos + 42)
    const nameStart = pos + 46
    const nameEnd = nameStart + nameLen
    if (nameEnd + extraLen + commentLen > cdEnd) {
      return { ok: false, error: 'invalid zip: truncated central directory name' }
    }
    const name = buf.subarray(nameStart, nameEnd).toString('utf8')
    if (hasPathTraversal(name)) {
      return { ok: false, error: `path traversal rejected: ${name}` }
    }
    entries.push({
      name,
      method,
      flags,
      compressedSize,
      uncompressedSize,
      localHeaderOffset,
    })
    pos = nameEnd + extraLen + commentLen
  }

  return { ok: true, entries }
}

function readEntryPayload(
  buf: Buffer,
  entry: ZipEntry,
  maxBytes: number,
  label: string,
): { ok: true; data: Buffer } | { ok: false; error: string } {
  if (entry.flags & 0x1) {
    return { ok: false, error: 'encrypted zip entries rejected' }
  }
  if (entry.uncompressedSize > maxBytes) {
    return {
      ok: false,
      error: `${label} exceeds ${maxBytes} bytes`,
    }
  }
  const off = entry.localHeaderOffset
  if (off + 30 > buf.length) {
    return { ok: false, error: 'invalid zip: local header out of bounds' }
  }
  if (buf.readUInt32LE(off) !== LF_SIG) {
    return { ok: false, error: 'invalid zip: bad local file header' }
  }
  const nameLen = buf.readUInt16LE(off + 26)
  const extraLen = buf.readUInt16LE(off + 28)
  const dataStart = off + 30 + nameLen + extraLen
  const dataEnd = dataStart + entry.compressedSize
  if (dataEnd > buf.length) {
    return { ok: false, error: 'invalid zip: compressed data out of bounds' }
  }
  const compressed = buf.subarray(dataStart, dataEnd)

  let raw: Buffer
  if (entry.method === 0) {
    raw = Buffer.from(compressed)
  } else if (entry.method === 8) {
    try {
      raw = inflateRawSync(compressed, { maxOutputLength: maxBytes })
    } catch {
      return { ok: false, error: 'invalid zip: deflate failed' }
    }
  } else {
    return { ok: false, error: `unsupported compression method: ${entry.method}` }
  }

  if (raw.byteLength > maxBytes) {
    return {
      ok: false,
      error: `${label} exceeds ${maxBytes} bytes`,
    }
  }
  if (entry.uncompressedSize > 0 && raw.byteLength !== entry.uncompressedSize) {
    return { ok: false, error: 'invalid zip: uncompressed size mismatch' }
  }
  return { ok: true, data: raw }
}

function pickRootManifest(entries: ZipEntry[]): ZipEntry | undefined {
  const normalized = entries.map((e) => ({
    entry: e,
    name: e.name.replace(/\\/g, '/'),
  }))
  for (const want of ROOT_MANIFEST_NAMES) {
    const hit = normalized.find((e) => e.name === want)
    if (hit) return hit.entry
  }
  return undefined
}

function findZipEntryByName(entries: ZipEntry[], want: string): ZipEntry | undefined {
  const target = want.replace(/\\/g, '/')
  return entries.find((e) => e.name.replace(/\\/g, '/') === target)
}

function resolveEntryPath(
  rawManifest: Record<string, unknown>,
  entries: ZipEntry[],
): { ok: true; path: string | null } | { ok: false; error: string } {
  for (const candidate of DEFAULT_ENTRY_CANDIDATES) {
    if (findZipEntryByName(entries, candidate)) {
      return { ok: true, path: candidate }
    }
  }

  if (Object.prototype.hasOwnProperty.call(rawManifest, 'entry')) {
    const safe = normalizeSafeEntryPath(rawManifest.entry)
    if (safe === null) {
      return { ok: false, error: 'entry path rejected (must be relative root path without ..)' }
    }
    if (!findZipEntryByName(entries, safe)) {
      return { ok: false, error: `entry not found in zip: ${safe}` }
    }
    return { ok: true, path: safe }
  }

  return { ok: true, path: null }
}

function toManifest(
  parsed: unknown,
):
  | { ok: true; manifest: ExtensionManifest; raw: Record<string, unknown> }
  | { ok: false; error: string } {
  if (parsed == null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, error: 'manifest must be a JSON object' }
  }
  const raw = parsed as Record<string, unknown>
  const id = typeof raw.id === 'string' ? raw.id.trim() : ''
  if (!id) return { ok: false, error: 'extension id required' }

  const manifest: ExtensionManifest = { id }
  if (typeof raw.name === 'string' && raw.name.trim()) {
    manifest.name = raw.name.trim()
  }
  if (typeof raw.version === 'string' && raw.version.trim()) {
    manifest.version = raw.version.trim()
  }
  if (raw.capabilities !== undefined) {
    if (!Array.isArray(raw.capabilities)) {
      return { ok: false, error: 'capabilities must be a string array' }
    }
    const caps: string[] = []
    for (const item of raw.capabilities) {
      if (typeof item !== 'string') {
        return { ok: false, error: 'capabilities must be a string array' }
      }
      const t = item.trim()
      if (t) caps.push(t)
    }
    manifest.capabilities = caps
  }
  // Phase A: extract permissions[] (preferred) alongside legacy capabilities[].
  if (raw.permissions !== undefined) {
    if (!Array.isArray(raw.permissions)) {
      return { ok: false, error: 'permissions must be a string array' }
    }
    const perms: ExtensionPermission[] = []
    for (const item of raw.permissions) {
      if (typeof item !== 'string') {
        return { ok: false, error: 'permissions must be a string array' }
      }
      const t = item.trim()
      if (t) perms.push(t as ExtensionPermission)
    }
    manifest.permissions = perms
  }
  if (raw.activation !== undefined) {
    const act = raw.activation
    if (
      act !== 'catalog_only' &&
      act !== 'worker_stub' &&
      act !== 'worker_js'
    ) {
      return {
        ok: false,
        error: "activation must be 'catalog_only', 'worker_stub', or 'worker_js'",
      }
    }
    manifest.activation = act as ExtensionActivationMode
  }
  return { ok: true, manifest, raw }
}

function stripPathKeys(manifest: ExtensionManifest): ExtensionManifest {
  const out: ExtensionManifest = { id: manifest.id }
  if (manifest.name !== undefined) out.name = manifest.name
  if (manifest.version !== undefined) out.version = manifest.version
  if (manifest.capabilities !== undefined) out.capabilities = [...manifest.capabilities]
  if (manifest.permissions !== undefined) out.permissions = [...manifest.permissions]
  if (manifest.activation !== undefined) out.activation = manifest.activation
  return out
}

/**
 * Parse a .opx zip buffer: require root `manifest.json` or `opx.manifest.json`.
 * Rejects path traversal, oversized zip/manifest; does not execute JS/CSS.
 * Wave 58A: when activation is `worker_js` (or a default entry exists for later use),
 * extracts a single allowlisted entry source into memory (cap OPX_ENTRY_SOURCE_MAX_BYTES).
 */
export function parseOpxManifestFromZip(
  buffer: Uint8Array | Buffer,
): ParseOpxManifestResult {
  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer)
  if (buf.byteLength === 0) {
    return { ok: false, error: 'empty zip' }
  }
  if (buf.byteLength > OPX_ZIP_MAX_BYTES) {
    return { ok: false, error: `zip exceeds ${OPX_ZIP_MAX_BYTES} bytes` }
  }

  const cd = readCentralDirectory(buf)
  if (!cd.ok) return cd

  const entry = pickRootManifest(cd.entries)
  if (!entry) {
    return {
      ok: false,
      error: 'root manifest.json or opx.manifest.json required',
    }
  }

  const payload = readEntryPayload(buf, entry, OPX_MANIFEST_MAX_BYTES, 'manifest')
  if (!payload.ok) return payload

  let parsed: unknown
  try {
    parsed = JSON.parse(payload.data.toString('utf8'))
  } catch {
    return { ok: false, error: 'manifest is not valid JSON' }
  }

  const built = toManifest(parsed)
  if (!built.ok) return built

  // Reject unsafe `entry` even when not used (e.g. catalog_only with traversal).
  if (Object.prototype.hasOwnProperty.call(built.raw, 'entry')) {
    const entryRaw = built.raw.entry
    if (entryRaw != null && String(entryRaw).trim() !== '') {
      if (normalizeSafeEntryPath(entryRaw) === null) {
        return {
          ok: false,
          error: 'entry path rejected (must be relative root path without ..)',
        }
      }
    }
  }

  const activation = built.manifest.activation ?? 'catalog_only'
  let entrySource: string | undefined
  let entryPath: string | undefined

  // Only worker_js stores entry bytes — catalog_only / worker_stub ignore JS in the zip.
  if (activation === 'worker_js') {
    const resolved = resolveEntryPath(built.raw, cd.entries)
    if (!resolved.ok) return resolved
    if (!resolved.path) {
      return {
        ok: false,
        error:
          'worker_js requires index.js, dist/host/index.js, or a path-safe manifest.entry in the zip',
      }
    }
    const jsEntry = findZipEntryByName(cd.entries, resolved.path)
    if (!jsEntry) {
      return { ok: false, error: `entry not found in zip: ${resolved.path}` }
    }
    const jsPayload = readEntryPayload(
      buf,
      jsEntry,
      OPX_ENTRY_SOURCE_MAX_BYTES,
      'entry source',
    )
    if (!jsPayload.ok) return jsPayload
    entrySource = jsPayload.data.toString('utf8')
    entryPath = resolved.path
  }

  // Path keys are stripped; STRIP_PATH_KEYS documents the allowlist of removed fields.
  void STRIP_PATH_KEYS
  const manifest = stripPathKeys(built.manifest)

  return {
    ok: true,
    manifest,
    ...(entrySource !== undefined ? { entrySource, entryPath } : {}),
  }
}
