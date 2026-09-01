/**
 * `opptrix-runtime.json` marker — schema, read, write.
 */
import fs from 'node:fs'
import path from 'node:path'
import { RUNTIME_MARKER_FILENAME } from './constants.js'

export type RuntimeRequires = {
  /** Semver range e.g. `>=24 <25` */
  node?: string
  /** e.g. `["linux-x64","linux-arm64","darwin-arm64"]` */
  platforms?: string[]
  /** Informational for UI/CLI; enforced against host base when set. */
  minBaseImage?: string
  /** Force base refresh even if node matches */
  requiresBaseRefresh?: boolean
}

export type RuntimeMarker = {
  app: 'opptrix'
  kind: 'runtime'
  version: string
  requires?: RuntimeRequires
  /** Relative paths under slot, e.g. `hooks/post-activate/01-migrate.mjs` */
  hooks?: { postActivate?: string[] }
}

/** Default Node range for current self-host images (Node 24). */
export const DEFAULT_RUNTIME_NODE_RANGE = '>=24 <25'

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function parseRequires(raw: unknown): RuntimeRequires | undefined {
  if (!isRecord(raw)) return undefined
  const out: RuntimeRequires = {}
  if (typeof raw.node === 'string' && raw.node.trim()) {
    out.node = raw.node.trim()
  }
  if (Array.isArray(raw.platforms)) {
    const platforms = raw.platforms.filter(
      (p): p is string => typeof p === 'string' && p.trim().length > 0,
    ).map(p => p.trim())
    if (platforms.length) out.platforms = platforms
  }
  if (typeof raw.minBaseImage === 'string' && raw.minBaseImage.trim()) {
    out.minBaseImage = raw.minBaseImage.trim()
  }
  if (typeof raw.requiresBaseRefresh === 'boolean') {
    out.requiresBaseRefresh = raw.requiresBaseRefresh
  }
  return Object.keys(out).length ? out : {}
}

function parseHooks(raw: unknown): RuntimeMarker['hooks'] | undefined {
  if (!isRecord(raw)) return undefined
  const post = raw.postActivate
  if (!Array.isArray(post)) {
    return Object.keys(raw).length ? {} : undefined
  }
  const postActivate = post.filter(
    (p): p is string => typeof p === 'string' && p.trim().length > 0,
  ).map(p => p.trim())
  return { postActivate }
}

/**
 * Read and lightly validate a slot's `opptrix-runtime.json`.
 * Returns null if missing or not a usable runtime marker.
 */
export function readRuntimeMarker(slotDir: string): RuntimeMarker | null {
  const file = path.join(path.resolve(slotDir), RUNTIME_MARKER_FILENAME)
  if (!fs.existsSync(file)) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    return null
  }
  if (!isRecord(parsed)) return null
  if (parsed.app !== 'opptrix' || parsed.kind !== 'runtime') return null
  if (typeof parsed.version !== 'string' || !parsed.version.trim()) return null

  const marker: RuntimeMarker = {
    app: 'opptrix',
    kind: 'runtime',
    version: parsed.version.trim(),
  }
  const requires = parseRequires(parsed.requires)
  if (requires !== undefined) marker.requires = requires
  const hooks = parseHooks(parsed.hooks)
  if (hooks !== undefined) marker.hooks = hooks
  return marker
}

export type WriteRuntimeMarkerMeta = {
  version?: string
  requires?: RuntimeRequires
  hooks?: { postActivate?: string[] }
  [key: string]: unknown
}

const BASE_IMAGE_TAG_PREFIX = 'opptrix-selfhost-v'

function resolveMinBaseImageForMarker(
  version: string,
  meta?: WriteRuntimeMarkerMeta | Record<string, unknown>,
): string | undefined {
  const fromMeta = meta && typeof meta === 'object'
    && meta.requires
    && typeof meta.requires === 'object'
    && !Array.isArray(meta.requires)
    && typeof (meta.requires as RuntimeRequires).minBaseImage === 'string'
    ? (meta.requires as RuntimeRequires).minBaseImage?.trim()
    : undefined
  if (fromMeta) return fromMeta

  const fromEnv = process.env.OPPTRIX_MIN_BASE_IMAGE?.trim()
  if (fromEnv) return fromEnv

  const releaseTag = process.env.OPPTRIX_RELEASE_TAG?.trim()
  if (releaseTag?.startsWith(BASE_IMAGE_TAG_PREFIX)) return releaseTag

  if (/^\d+\.\d+\.\d+/.test(version.trim())) {
    return `${BASE_IMAGE_TAG_PREFIX}${version.trim()}`
  }
  return undefined
}

/**
 * Write a runtime marker. When `version` is provided (arg or meta), richer
 * defaults (`requires.node`, empty `hooks.postActivate`) are applied while
 * remaining backward compatible with `{ version }` callers.
 */
export function writeRuntimeMarker(
  dir: string,
  meta?: WriteRuntimeMarkerMeta | Record<string, unknown>,
): string {
  const file = path.join(dir, RUNTIME_MARKER_FILENAME)
  fs.mkdirSync(dir, { recursive: true })

  const versionFromMeta =
    meta && typeof meta.version === 'string' && meta.version.trim()
      ? meta.version.trim()
      : undefined

  const body: Record<string, unknown> = {
    app: 'opptrix',
    kind: 'runtime',
  }

  if (versionFromMeta) {
    const minBaseImage = resolveMinBaseImageForMarker(versionFromMeta, meta)
    body.version = versionFromMeta
    body.requires = {
      node: DEFAULT_RUNTIME_NODE_RANGE,
      ...(minBaseImage ? { minBaseImage } : {}),
    }
    body.hooks = {
      postActivate: [] as string[],
    }
  }

  if (meta) {
    for (const [k, v] of Object.entries(meta)) {
      if (v === undefined) continue
      body[k] = v
    }
  }

  fs.writeFileSync(file, `${JSON.stringify(body, null, 2)}\n`, 'utf8')
  return file
}
