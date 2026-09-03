/**
 * FTP helpers for self-host hot-update CDN mirror (CN: update.opptrix.evzs.com).
 * Remote layout matches R2 object keys under the FTP login home (usually site root):
 *   hot/check-update
 *   hot/releases
 *   hot/packages/opptrix-runtime-*.bin|.sha256
 *
 * Paths are relative to the FTP login directory (chroot-friendly). Absolute
 * `/hot/...` breaks on chrooted accounts (550 Can't change directory).
 *
 * basic-ftp leaves CWD inside the last ensureDir/cd target — every multi-step
 * operation must re-enter login home before using login-relative paths.
 */
import path from 'node:path'
import { Readable } from 'node:stream'
import {
  HOT_CHECK_UPDATE_KEY,
  HOT_PACKAGES_PREFIX,
  HOT_RELEASES_KEY,
  HOT_RELEASES_RETENTION_FLOOR,
  HOT_RELEASES_RETENTION_MAX,
  RUNTIME_LINUX_ARCH_KEYS,
  normalizeHotVersion,
  runtimeArchBinFilename,
  runtimeArchBinSha256Filename,
  runtimeBinFilename,
  runtimeBinSha256Filename,
} from './hot-cdn.mjs'

/**
 * Empty string = FTP login home (site document root for update.opptrix.evzs.com).
 * Non-empty = subdirectory under login home (no leading slash).
 */
export const DEFAULT_HOT_FTP_REMOTE_DIR = ''

/** Public CN hot CDN (HTTP smoke / docs). */
export const DEFAULT_CN_HOT_CDN_BASE = 'https://update.opptrix.evzs.com'

export { HOT_CHECK_UPDATE_KEY, HOT_PACKAGES_PREFIX, HOT_RELEASES_KEY, HOT_RELEASES_RETENTION_FLOOR, HOT_RELEASES_RETENTION_MAX }

/**
 * Normalize FTP remote root relative to login home (strip leading/trailing `/`).
 * @param {NodeJS.ProcessEnv} [env]
 */
export function resolveHotFtpRemoteDir(env = process.env) {
  const raw = String(env.FTP_REMOTE_DIR ?? '').trim()
  if (!raw || raw === '/' || raw === '.') return DEFAULT_HOT_FTP_REMOTE_DIR
  return raw.replace(/^\/+/, '').replace(/\/+$/, '')
}

/**
 * Remote path relative to login home: remoteRoot + object key.
 * @param {string} remoteRoot
 * @param {string} objectKey
 */
export function joinHotFtpRemotePath(remoteRoot, objectKey) {
  const key = String(objectKey ?? '').replace(/^\/+/, '').replace(/\\/g, '/')
  if (!key || key.includes('..')) {
    throw new Error(`invalid hot FTP object key: ${objectKey}`)
  }
  const root = String(remoteRoot ?? '').replace(/^\/+/, '').replace(/\/+$/, '')
  if (!root) return key
  return path.posix.join(root, key)
}

/**
 * Capture pwd right after access — treat as immutable login home for the session.
 * @param {import('basic-ftp').Client} client
 */
export async function captureHotFtpLoginHome(client) {
  const home = String(await client.pwd()).trim()
  return home || '/'
}

/**
 * @param {import('basic-ftp').Client} client
 * @param {string} loginHome
 */
export async function cdHotFtpLoginHome(client, loginHome) {
  const home = String(loginHome ?? '').trim() || '/'
  await client.cd(home)
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
 * @param {string} remoteDir path relative to current CWD (caller must be at login home)
 */
export async function remoteDirExists(client, remoteDir) {
  const dir = String(remoteDir ?? '').replace(/^\/+/, '').replace(/\/+$/, '') || '.'
  try {
    await client.list(dir)
    return true
  } catch {
    return false
  }
}

/**
 * List then create only when missing (segment by segment).
 * Always re-enters loginHome before each check/create so paths stay login-relative.
 * @param {import('basic-ftp').Client} client
 * @param {string} remoteDir
 * @param {string} [loginHome] pwd() after access; captured if omitted
 * @returns {Promise<{ path: string, created: string[] }>}
 */
export async function ensureRemoteDirIfMissing(client, remoteDir, loginHome) {
  const home = String(loginHome ?? await client.pwd()).trim() || '/'
  const raw = String(remoteDir ?? '').replace(/\\/g, '/').trim()
  if (!raw || raw === '/' || raw === '.') {
    await cdHotFtpLoginHome(client, home)
    return { path: '.', created: [] }
  }
  const normalized = raw.replace(/^\/+/, '').replace(/\/+$/, '')
  const parts = normalized.split('/').filter(Boolean)
  /** @type {string[]} */
  const created = []
  let current = ''
  for (const part of parts) {
    current = current ? `${current}/${part}` : part
    await cdHotFtpLoginHome(client, home)
    const exists = await remoteDirExists(client, current)
    if (!exists) {
      await cdHotFtpLoginHome(client, home)
      await client.ensureDir(current)
      created.push(current)
      console.log(`[ftp:hot] created dir ${current}`)
    }
  }
  await cdHotFtpLoginHome(client, home)
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
 * Upload a local file into remoteRoot/objectKey (from login home → dirname → STOR).
 * @param {import('basic-ftp').Client} client
 * @param {string} remoteRoot
 * @param {string} objectKey
 * @param {string} localPath
 * @param {string} [loginHome]
 */
export async function uploadHotFtpFile(client, remoteRoot, objectKey, localPath, loginHome) {
  const home = String(loginHome ?? await client.pwd()).trim() || '/'
  const remotePath = joinHotFtpRemotePath(remoteRoot, objectKey)
  const dir = path.posix.dirname(remotePath)
  const name = path.posix.basename(remotePath)
  await ensureRemoteDirIfMissing(client, dir === '.' ? '' : dir, home)
  await cdHotFtpLoginHome(client, home)
  if (dir && dir !== '.') {
    await client.cd(dir)
  }
  await client.uploadFrom(localPath, name)
  await cdHotFtpLoginHome(client, home)
  return remotePath
}

/**
 * Upload UTF-8 text as remoteRoot/objectKey.
 * @param {import('basic-ftp').Client} client
 * @param {string} remoteRoot
 * @param {string} objectKey
 * @param {string} body
 * @param {string} [loginHome]
 */
export async function uploadHotFtpText(client, remoteRoot, objectKey, body, loginHome) {
  const home = String(loginHome ?? await client.pwd()).trim() || '/'
  const remotePath = joinHotFtpRemotePath(remoteRoot, objectKey)
  const dir = path.posix.dirname(remotePath)
  const name = path.posix.basename(remotePath)
  await ensureRemoteDirIfMissing(client, dir === '.' ? '' : dir, home)
  await cdHotFtpLoginHome(client, home)
  if (dir && dir !== '.') {
    await client.cd(dir)
  }
  const buf = Buffer.from(body, 'utf8')
  await client.uploadFrom(Readable.from([buf]), name)
  await cdHotFtpLoginHome(client, home)
  return remotePath
}

/**
 * List package dir, prune artifacts not in keep set (retention).
 * @param {import('basic-ftp').Client} client
 * @param {string} remoteRoot
 * @param {ReadonlySet<string> | Iterable<string>} keepNames
 * @param {string} [loginHome]
 */
export async function pruneHotFtpPackages(client, remoteRoot, keepNames, loginHome) {
  const home = String(loginHome ?? await client.pwd()).trim() || '/'
  const packagesDir = joinHotFtpRemotePath(remoteRoot, HOT_PACKAGES_PREFIX)
  await cdHotFtpLoginHome(client, home)
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
  await cdHotFtpLoginHome(client, home)
  return { pruned: prune, kept }
}
