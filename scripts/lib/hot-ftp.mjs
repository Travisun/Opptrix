/**
 * FTP helpers for self-host hot-update CDN mirror (CN: update.opptrix.evzs.com).
 * Remote layout matches R2 object keys under the FTP site root:
 *   hot/check-update
 *   hot/releases
 *   hot/packages/opptrix-runtime-*.bin|.sha256
 */
import path from 'node:path'
import { Readable } from 'node:stream'
import {
  HOT_CHECK_UPDATE_KEY,
  HOT_PACKAGES_PREFIX,
  HOT_RELEASES_KEY,
  HOT_RELEASES_RETENTION_MAX,
  RUNTIME_LINUX_ARCH_KEYS,
  normalizeHotVersion,
  runtimeArchBinFilename,
  runtimeArchBinSha256Filename,
  runtimeBinFilename,
  runtimeBinSha256Filename,
} from './hot-cdn.mjs'

/** Default FTP document root — same path layout as https://update.opptrix.evzs.com/ */
export const DEFAULT_HOT_FTP_REMOTE_DIR = '/'

/** Public CN hot CDN (HTTP smoke / docs). */
export const DEFAULT_CN_HOT_CDN_BASE = 'https://update.opptrix.evzs.com'

export { HOT_CHECK_UPDATE_KEY, HOT_PACKAGES_PREFIX, HOT_RELEASES_KEY, HOT_RELEASES_RETENTION_MAX }

/**
 * @param {NodeJS.ProcessEnv} [env]
 */
export function resolveHotFtpRemoteDir(env = process.env) {
  const raw = String(env.FTP_REMOTE_DIR ?? '').trim()
  if (!raw || raw === '/' || raw === '.') return DEFAULT_HOT_FTP_REMOTE_DIR
  const withSlash = raw.startsWith('/') ? raw : `/${raw}`
  return withSlash.replace(/\/+$/, '') || DEFAULT_HOT_FTP_REMOTE_DIR
}

/**
 * Absolute remote path: remoteRoot + object key (e.g. hot/packages/foo.bin).
 * @param {string} remoteRoot
 * @param {string} objectKey
 */
export function joinHotFtpRemotePath(remoteRoot, objectKey) {
  const key = String(objectKey ?? '').replace(/^\/+/, '').replace(/\\/g, '/')
  if (!key || key.includes('..')) {
    throw new Error(`invalid hot FTP object key: ${objectKey}`)
  }
  const root = String(remoteRoot ?? DEFAULT_HOT_FTP_REMOTE_DIR).replace(/\/+$/, '') || ''
  if (!root || root === '/') return `/${key}`
  const normalized = root.startsWith('/') ? root : `/${root}`
  return path.posix.join(normalized, key)
}

/**
 * Runtime package artifact basenames only (not manifests).
 * @param {string} name
 */
export function isHotRuntimePackageArtifact(name) {
  const raw = String(name ?? '')
  if (!raw || raw.includes('/') || raw.includes('\\')) return false
  const base = path.posix.basename(raw)
  if (!base || base !== raw) return false
  return /^opptrix-runtime(?:-linux-(?:x64|arm64))?-v[\w.+-]+\.(?:bin|sha256)$/i.test(base)
}

/**
 * All package basenames retained for one version (arch + legacy alias).
 * @param {string} version
 */
export function hotPackageBasenamesForVersion(version) {
  const v = normalizeHotVersion(version)
  /** @type {string[]} */
  const names = [runtimeBinFilename(v), runtimeBinSha256Filename(v)]
  for (const archKey of RUNTIME_LINUX_ARCH_KEYS) {
    names.push(runtimeArchBinFilename(v, archKey), runtimeArchBinSha256Filename(v, archKey))
  }
  return names
}

/**
 * @param {Iterable<string>} versions
 */
export function buildHotPackageKeepNames(versions) {
  /** @type {Set<string>} */
  const keep = new Set()
  for (const version of versions) {
    for (const name of hotPackageBasenamesForVersion(version)) {
      keep.add(name)
    }
  }
  return keep
}

/**
 * @param {Iterable<string>} remoteNames
 * @param {ReadonlySet<string> | Iterable<string>} keepNames
 */
export function selectHotPackageFilesToPrune(remoteNames, keepNames) {
  const keep = keepNames instanceof Set ? keepNames : new Set(keepNames)
  /** @type {string[]} */
  const out = []
  for (const name of remoteNames) {
    if (!isHotRuntimePackageArtifact(name)) continue
    if (keep.has(name)) continue
    out.push(name)
  }
  return [...new Set(out)].sort()
}

/**
 * @param {Array<{ name?: string, isFile?: boolean, isDirectory?: boolean, type?: number }>} listing
 */
export function listingFileNames(listing) {
  /** @type {string[]} */
  const out = []
  for (const entry of listing ?? []) {
    const name = entry?.name
    if (typeof name !== 'string' || !name) continue
    if (name.includes('/') || name.includes('\\')) continue
    const isFile = typeof entry.isFile === 'boolean'
      ? entry.isFile
      : !(entry.isDirectory === true || entry.type === 2)
    if (!isFile) continue
    out.push(name)
  }
  return out
}

/**
 * @param {import('basic-ftp').Client} client
 * @param {string} remoteDir
 */
export async function remoteDirExists(client, remoteDir) {
  const dir = String(remoteDir ?? '').replace(/\/+$/, '') || '/'
  try {
    await client.list(dir)
    return true
  } catch {
    return false
  }
}

/**
 * List parent; create only when missing (segment by segment).
 * @param {import('basic-ftp').Client} client
 * @param {string} remoteDir
 * @returns {Promise<{ path: string, created: string[] }>}
 */
export async function ensureRemoteDirIfMissing(client, remoteDir) {
  const raw = String(remoteDir ?? '').replace(/\\/g, '/').trim() || '/'
  if (raw === '/' || raw === '.') {
    return { path: '/', created: [] }
  }
  const normalized = (raw.startsWith('/') ? raw : `/${raw}`).replace(/\/+$/, '') || '/'
  const parts = normalized.split('/').filter(Boolean)
  /** @type {string[]} */
  const created = []
  let current = ''
  for (const part of parts) {
    current = `${current}/${part}`
    const exists = await remoteDirExists(client, current)
    if (!exists) {
      await client.ensureDir(current)
      created.push(current)
      console.log(`[ftp:hot] created dir ${current}`)
    }
  }
  return { path: normalized, created }
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 */
export function requireHotFtpEnv(env = process.env) {
  const host = String(env.FTP_HOST ?? '').trim()
  const user = String(env.FTP_USERNAME ?? '').trim()
  const password = String(env.FTP_PASSWORD ?? '')
  if (!host) throw new Error('FTP_HOST is required')
  if (!user) throw new Error('FTP_USERNAME is required')
  if (!password) throw new Error('FTP_PASSWORD is required')
  const port = Number(env.FTP_PORT ?? '21')
  const secureRaw = String(env.FTP_SECURE ?? '').trim().toLowerCase()
  const secure = secureRaw === '1' || secureRaw === 'true' || secureRaw === 'yes'
  return {
    host,
    user,
    password,
    port: Number.isFinite(port) && port > 0 ? port : 21,
    secure,
    remoteDir: resolveHotFtpRemoteDir(env),
  }
}

/**
 * Upload a local file into remoteRoot/objectKey (cd to dirname, STOR basename).
 * @param {import('basic-ftp').Client} client
 * @param {string} remoteRoot
 * @param {string} objectKey
 * @param {string} localPath
 */
export async function uploadHotFtpFile(client, remoteRoot, objectKey, localPath) {
  const abs = joinHotFtpRemotePath(remoteRoot, objectKey)
  const dir = path.posix.dirname(abs)
  const name = path.posix.basename(abs)
  await ensureRemoteDirIfMissing(client, dir)
  await client.cd(dir)
  await client.uploadFrom(localPath, name)
  return abs
}

/**
 * Upload UTF-8 text as remoteRoot/objectKey.
 * @param {import('basic-ftp').Client} client
 * @param {string} remoteRoot
 * @param {string} objectKey
 * @param {string} body
 */
export async function uploadHotFtpText(client, remoteRoot, objectKey, body) {
  const abs = joinHotFtpRemotePath(remoteRoot, objectKey)
  const dir = path.posix.dirname(abs)
  const name = path.posix.basename(abs)
  await ensureRemoteDirIfMissing(client, dir)
  await client.cd(dir)
  const buf = Buffer.from(body, 'utf8')
  await client.uploadFrom(Readable.from([buf]), name)
  return abs
}

/**
 * List package dir, prune artifacts not in keep set (retention).
 * @param {import('basic-ftp').Client} client
 * @param {string} remoteRoot
 * @param {ReadonlySet<string> | Iterable<string>} keepNames
 */
export async function pruneHotFtpPackages(client, remoteRoot, keepNames) {
  const packagesDir = joinHotFtpRemotePath(remoteRoot, HOT_PACKAGES_PREFIX)
  const exists = await remoteDirExists(client, packagesDir)
  if (!exists) {
    console.log(`[ftp:hot] packages dir missing (${packagesDir}) — skip prune`)
    return { pruned: [], kept: [] }
  }
  await client.cd(packagesDir)
  const listing = await client.list()
  const names = listingFileNames(listing)
  const prune = selectHotPackageFilesToPrune(names, keepNames)
  const keep = keepNames instanceof Set ? keepNames : new Set(keepNames)
  const kept = names.filter((n) => isHotRuntimePackageArtifact(n) && keep.has(n)).sort()

  for (const name of prune) {
    console.log(`[ftp:hot] removing obsolete package: ${name}`)
    await client.remove(name)
  }
  return { pruned: prune, kept }
}
