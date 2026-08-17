#!/usr/bin/env node
/**
 * Upload current release assets to FTP (primary desktop distribution path).
 *
 * Upload order (avoids update-feed windows):
 *   1) binaries / CMS / blockmaps
 *   2) LIST feed root → log installers (keep / obsolete)
 *   3) force-overwrite the three public latest-*.yml (feed flips to new packages)
 *   4) prune obsolete installers + stale release files (incl. per-arch yml)
 *   5) LIST + assertYmlsAtRemoteRoot + SIZE
 *   6) log final kept installers
 *
 * Yml is overwritten *before* deleting old installers so the public feed never
 * points at files we just removed.
 * Files land under /desktop/ (FTP feed root, same as update CDN path):
 * e.g. /desktop/latest-mac.yml, /desktop/Opptrix-….dmg. Never upload yml to FTP /.
 * After cd(/desktop), STOR uses basename only so cwd drift cannot bury files.
 *
 * Env:
 *   FTP_HOST (required in CI; local may skip if unset)
 *   FTP_USERNAME / FTP_PASSWORD
 *   FTP_REMOTE_DIR (optional; must resolve to …/desktop, default `/desktop`)
 *   FTP_PORT (optional; default 21)
 *   FTP_SECURE (optional; "true" / "1" for explicit TLS)
 *   OPPTRIX_UPDATE_BASE_URL (optional; used when FTP_REMOTE_DIR unset)
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Client } from 'basic-ftp'
import { r2KeyPrefixFromFeedUrl, resolveUpdateFeedUrl } from './lib/update-feed-url.mjs'
import {
  UPDATE_YML_MAC_PER_ARCH,
  UPDATE_YML_PUBLIC,
} from './lib/release-metadata-policy.mjs'
import {
  compareUploadOrder,
  partitionUploadBatches,
  shouldUpload,
} from './sync-release-to-r2.mjs'

const INSTALLER_EXT = /\.(dmg|zip|exe|AppImage|deb)$/i
const STALE_PER_ARCH_YML = new Set(UPDATE_YML_MAC_PER_ARCH)

/** FTP / CDN feed directory — installers and latest-*.yml must live here (not FTP `/`). */
export const DEFAULT_FTP_FEED_DIR = '/desktop'

function usage() {
  console.error('Usage: sync-release-to-ftp.mjs <release-assets-dir>')
  process.exit(1)
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`
}

/**
 * Resolve FTP feed root. Public yml + installers must be under `/desktop`
 * (same as `https://update.opptrix.org/desktop/`). Never use bare `/`.
 *
 * @param {NodeJS.ProcessEnv} [env]
 */
export function resolveRemoteDir(env = process.env) {
  const raw = String(env.FTP_REMOTE_DIR ?? '').trim()
  let dir
  if (raw) {
    dir = raw.startsWith('/') ? raw.replace(/\/+$/, '') || '/' : `/${raw.replace(/\/+$/, '')}`
  } else {
    const prefix = r2KeyPrefixFromFeedUrl(resolveUpdateFeedUrl())
    dir = `/${prefix}`
  }
  return ensureDesktopFeedDir(dir)
}

/**
 * Coerce / validate that the remote dir is the desktop feed root (…/desktop).
 * @param {string} dir
 */
export function ensureDesktopFeedDir(dir) {
  const normalized = String(dir ?? '').replace(/\/+$/, '') || '/'
  const segments = normalized.split('/').filter(Boolean)
  if (normalized === '/' || !segments.includes('desktop')) {
    if (normalized !== DEFAULT_FTP_FEED_DIR) {
      console.warn(
        `[ftp] remote dir "${normalized}" is not under /desktop — `
          + `using ${DEFAULT_FTP_FEED_DIR} so latest-*.yml and installers share the feed root`,
      )
    }
    return DEFAULT_FTP_FEED_DIR
  }
  // Prefer canonical `/desktop` when the last segment is desktop
  if (segments[segments.length - 1] === 'desktop') {
    return `/${segments.join('/')}`
  }
  // e.g. /desktop/archives → still require trailing desktop feed; use /desktop
  console.warn(
    `[ftp] remote dir "${normalized}" has non-desktop leaf — using ${DEFAULT_FTP_FEED_DIR}`,
  )
  return DEFAULT_FTP_FEED_DIR
}

/**
 * Absolute remote path under the feed root (never relative to a drifted cwd).
 * @param {string} remoteDir e.g. `/desktop`
 * @param {string} name basename only, e.g. `latest-mac.yml`
 */
export function remotePathFor(remoteDir, name) {
  const base = path.posix.basename(String(name ?? ''))
  if (!base || base === '.' || base === '..') {
    throw new Error(`Invalid remote file name: ${name}`)
  }
  const dir = String(remoteDir ?? '').replace(/\/+$/, '') || '/'
  if (dir === '/') return `/${base}`
  const normalized = dir.startsWith('/') ? dir : `/${dir}`
  return path.posix.join(normalized, base)
}

/**
 * Assert public latest-*.yml appear as root-level files in an FTP listing
 * (after `cd(remoteDir)` — entry.name is basename, not a nested path).
 * @param {Array<{ name?: string, isFile?: boolean, isDirectory?: boolean, type?: number }>} listing
 * @param {readonly string[]} [required]
 */
export function assertYmlsAtRemoteRoot(listing, required = UPDATE_YML_PUBLIC) {
  const rootFiles = new Set()
  for (const entry of listing ?? []) {
    const name = entry?.name
    if (typeof name !== 'string' || !name) continue
    if (name.includes('/') || name.includes('\\')) continue
    const isFile = typeof entry.isFile === 'boolean'
      ? entry.isFile
      : !(entry.isDirectory === true || entry.type === 2)
    if (!isFile) continue
    rootFiles.add(name)
  }
  const missing = [...required].filter((yml) => !rootFiles.has(yml))
  if (missing.length > 0) {
    throw new Error(
      `Public update yml missing at FTP feed root: ${missing.join(', ')}`,
    )
  }
}

/** Installer packages only (dmg/zip/exe/AppImage/deb) — not yml/blockmap/cms. */
export function isRemoteInstallerName(name) {
  const raw = String(name ?? '')
  // Root listing only — reject path-like names before basename stripping.
  if (!raw || raw.includes('/') || raw.includes('\\')) return false
  const base = path.posix.basename(raw)
  if (!base || base !== raw) return false
  return INSTALLER_EXT.test(base)
}

/**
 * Whether a root-level remote name should be deleted after this upload's keep set.
 * Keep names are never pruned. Stale per-arch mac yml always prune.
 * Other release artifacts prune when `shouldUpload` would accept them and they
 * are not in keep (covers obsolete installers, blockmaps, cms, public yml).
 * @param {string} name
 * @param {ReadonlySet<string> | Iterable<string>} keepNames
 */
export function shouldPruneRemoteName(name, keepNames) {
  const raw = String(name ?? '')
  if (!raw || raw.includes('/') || raw.includes('\\')) return false
  const base = path.posix.basename(raw)
  if (!base || base !== raw) return false
  const keep = keepNames instanceof Set ? keepNames : new Set(keepNames)
  if (keep.has(base)) return false
  if (STALE_PER_ARCH_YML.has(base)) return true
  return shouldUpload(base)
}

/**
 * Classify feed-root listing against this release's keep set.
 * @param {Array<{ name?: string, isFile?: boolean, isDirectory?: boolean, type?: number }>} listing
 * @param {ReadonlySet<string> | Iterable<string>} keepNames
 * @returns {{
 *   installersKept: string[],
 *   installersObsolete: string[],
 *   releaseObsolete: string[],
 *   ymlsPresent: string[],
 * }}
 */
export function classifyRemoteRootListing(listing, keepNames) {
  const keep = keepNames instanceof Set ? keepNames : new Set(keepNames)
  const installersKept = []
  const installersObsolete = []
  const releaseObsolete = []
  const ymlsPresent = []

  for (const entry of listing ?? []) {
    const name = entry?.name
    if (typeof name !== 'string' || !name) continue
    if (name.includes('/') || name.includes('\\')) continue
    const isFile = typeof entry.isFile === 'boolean'
      ? entry.isFile
      : !(entry.isDirectory === true || entry.type === 2)
    if (!isFile) continue

    if (UPDATE_YML_PUBLIC.includes(name)) {
      ymlsPresent.push(name)
    }

    if (isRemoteInstallerName(name)) {
      if (keep.has(name)) installersKept.push(name)
      else installersObsolete.push(name)
    }

    if (shouldPruneRemoteName(name, keep)) {
      releaseObsolete.push(name)
    }
  }

  installersKept.sort()
  installersObsolete.sort()
  releaseObsolete.sort()
  ymlsPresent.sort()
  return { installersKept, installersObsolete, releaseObsolete, ymlsPresent }
}

function collectUploadFiles(dir) {
  const names = fs.readdirSync(dir).filter(shouldUpload).sort(compareUploadOrder)
  if (names.length === 0) {
    throw new Error(`No release artifacts to upload under ${dir}`)
  }
  for (const yml of UPDATE_YML_PUBLIC) {
    if (!names.includes(yml)) {
      throw new Error(`Missing ${yml} in ${dir} — finalize-release must complete first`)
    }
  }
  return names.map((name) => ({
    name,
    filePath: path.join(dir, name),
    size: fs.statSync(path.join(dir, name)).size,
  }))
}

function requireFtpEnv() {
  const host = String(process.env.FTP_HOST ?? '').trim()
  const user = String(process.env.FTP_USERNAME ?? '').trim()
  const password = String(process.env.FTP_PASSWORD ?? '')
  if (!host) throw new Error('FTP_HOST is required')
  if (!user) throw new Error('FTP_USERNAME is required')
  if (!password) throw new Error('FTP_PASSWORD is required')
  const port = Number(process.env.FTP_PORT ?? '21')
  const secureRaw = String(process.env.FTP_SECURE ?? '').trim().toLowerCase()
  const secure = secureRaw === '1' || secureRaw === 'true' || secureRaw === 'yes'
  return { host, user, password, port: Number.isFinite(port) && port > 0 ? port : 21, secure }
}

async function main() {
  const sourceDir = process.argv[2]
  if (!sourceDir) usage()

  if (!String(process.env.FTP_HOST ?? '').trim()) {
    console.log('[ftp] FTP_HOST not set — skipping sync')
    return
  }

  const ftp = requireFtpEnv()
  const remoteDir = resolveRemoteDir()
  if (remoteDir !== DEFAULT_FTP_FEED_DIR && !remoteDir.endsWith('/desktop')) {
    throw new Error(
      `FTP remote dir must be under /desktop (got ${remoteDir}); `
        + `public yml must be at ${DEFAULT_FTP_FEED_DIR}/latest-*.yml`,
    )
  }
  const files = collectUploadFiles(sourceDir)
  const totalBytes = files.reduce((sum, f) => sum + f.size, 0)
  const keepNames = new Set(files.map((f) => f.name))
  const { binaries, ymls } = partitionUploadBatches(files)

  console.log(`[ftp] host: ${ftp.host}:${ftp.port} secure=${ftp.secure}`)
  console.log(`[ftp] remote dir: ${remoteDir}`)
  console.log(`[ftp] uploading ${files.length} file(s), ${formatBytes(totalBytes)} total`)
  console.log(
    `[ftp] upload batches: ${binaries.length} binary/other, then yml overwrite, then prune`,
  )

  const client = new Client(60 * 60 * 1000)
  client.ftp.verbose = process.env.FTP_VERBOSE === '1'
  try {
    await client.access({
      host: ftp.host,
      user: ftp.user,
      password: ftp.password,
      port: ftp.port,
      secure: ftp.secure,
    })
    await client.ensureDir(remoteDir)

    /**
     * Upload into feed root. Always `cd(remoteDir)` first, then STOR by
     * **basename only** — never pass `/desktop/foo.yml` while cwd is already
     * `/desktop` (some FTP servers would nest or double-prefix the path).
     * `remotePathFor` is the canonical public path used only for logs/checks.
     */
    async function uploadBatch(batch, { overwrite = false } = {}) {
      await client.cd(remoteDir)
      for (const file of batch) {
        const canonical = remotePathFor(remoteDir, file.name)
        const remoteName = path.posix.basename(file.name)
        const label = overwrite ? 'overwrite yml' : 'uploading'
        console.log(`[ftp] ${label}: ${canonical} (${formatBytes(file.size)})…`)
        await client.uploadFrom(file.filePath, remoteName)
        console.log(`[ftp] ${overwrite ? 'overwrote' : 'uploaded'} ${canonical}`)
      }
    }

    // 1) New installers / CMS / blockmaps first.
    await uploadBatch(binaries)

    // 2) LIST → classify keep / obsolete installers (+ other release orphans).
    await client.cd(remoteDir)
    const listingBeforePrune = await client.list()
    const classified = classifyRemoteRootListing(listingBeforePrune, keepNames)
    const installerNames = [
      ...classified.installersKept,
      ...classified.installersObsolete,
    ].sort()
    console.log(
      `[ftp] remote installers (${installerNames.length}): ${
        installerNames.length > 0 ? installerNames.join(', ') : '(none)'
      }`,
    )
    if (classified.installersKept.length > 0) {
      console.log(`[ftp] installers keep: ${classified.installersKept.join(', ')}`)
    }
    if (classified.installersObsolete.length > 0) {
      console.log(`[ftp] installers obsolete: ${classified.installersObsolete.join(', ')}`)
    }

    // 3) Force-overwrite public latest-*.yml *before* deleting old packages
    //    so the feed never points at files we are about to remove.
    await uploadBatch(ymls, { overwrite: true })

    // 4) Delete obsolete installers and stale release files (incl. per-arch yml).
    await client.cd(remoteDir)
    for (const name of classified.releaseObsolete) {
      if (isRemoteInstallerName(name)) {
        console.log(`[ftp] removing obsolete installer: ${name}`)
      } else {
        console.log(`[ftp] removing obsolete ${name}`)
      }
      await client.remove(name)
    }

    // 5) LIST + assert + SIZE (yml must still be at feed root after prune)
    await client.cd(remoteDir)
    const listingFinal = await client.list()
    assertYmlsAtRemoteRoot(listingFinal)
    for (const yml of UPDATE_YML_PUBLIC) {
      const size = await client.size(yml)
      if (!(size > 0)) {
        throw new Error(`FTP feed root yml empty or missing: ${remotePathFor(remoteDir, yml)}`)
      }
      console.log(`[ftp] yml root: ${remotePathFor(remoteDir, yml)} (${formatBytes(size)})`)
    }

    // 6) Final kept installers
    const finalClassified = classifyRemoteRootListing(listingFinal, keepNames)
    console.log(
      `[ftp] kept installers (${finalClassified.installersKept.length}): ${
        finalClassified.installersKept.length > 0
          ? finalClassified.installersKept.join(', ')
          : '(none)'
      }`,
    )

    console.log(`[ftp] sync complete — ${files.length} file(s) under ${remoteDir}`)
  } finally {
    client.close()
  }
}

const isDirectRun = process.argv[1]
  && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))

if (isDirectRun) {
  main().catch((err) => {
    console.error('[ftp] sync failed:', err instanceof Error ? err.message : err)
    process.exit(1)
  })
}
