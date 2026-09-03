#!/usr/bin/env node
/**
 * Upload self-host hot-update runtime (.bin + .sha256) and manifests to CN FTP CDN.
 *
 * Layout (under FTP_REMOTE_DIR, default `/` = site root for update.opptrix.evzs.com):
 *   hot/packages/*.bin|.sha256
 *   hot/check-update
 *   hot/releases
 *
 * Order (same safety as historical desktop FTP):
 *   1) ensure dirs (list → create only if missing)
 *   2) upload packages
 *   3) overwrite manifests (feed flip)
 *   4) prune package files outside retained ≤8 versions
 *
 * Manifest URLs use authoritative CDN (update.opptrix.org); CN clients rewrite host.
 *
 * Usage:
 *   node scripts/sync-hot-to-ftp.mjs --dir dist-runtime --version 1.4.5
 *   node scripts/sync-hot-to-ftp.mjs --dir dist-runtime --version 1.4.5 --dry-run
 *
 * Env: FTP_HOST, FTP_USERNAME, FTP_PASSWORD
 * Optional: FTP_PORT, FTP_SECURE, FTP_REMOTE_DIR, FTP_VERBOSE
 *           OPPTRIX_UPDATE_CDN_BASE (manifest URL host; default update.opptrix.org)
 *           HOT_FTP_SMOKE_BASE (optional HTTP smoke after sync; default CN CDN)
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  HOT_CHECK_UPDATE_KEY,
  HOT_PACKAGES_PREFIX,
  HOT_RELEASES_KEY,
  HOT_RELEASES_RETENTION_MAX,
  hotCheckUpdateUrl,
  hotReleasesUrl,
  normalizeCdnBase,
  prepareHotReleaseSync,
  resolveHotMultiArchUploadPlan,
} from './lib/hot-cdn.mjs'
import {
  DEFAULT_CN_HOT_CDN_BASE,
  buildHotPackageKeepNames,
  captureHotFtpLoginHome,
  ensureRemoteDirIfMissing,
  joinHotFtpRemotePath,
  pruneHotFtpPackages,
  requireHotFtpEnv,
  uploadHotFtpFile,
  uploadHotFtpText,
} from './lib/hot-ftp.mjs'
import { loadReleaseNotesForVersion } from './lib/release-notes.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const HELP = `Usage: node scripts/sync-hot-to-ftp.mjs [options]

Upload hot-update runtime package + check-update/releases manifests to CN FTP CDN.

Options:
  --dir <dir>          Directory with pack output (default: dist-runtime)
  --version <semver>   Runtime version (X.Y.Z)
  --cdn-base <url>     Manifest URL base (default: OPPTRIX_UPDATE_CDN_BASE / update.opptrix.org)
  --smoke-base <url>   Optional HTTP smoke base after upload (default: HOT_FTP_SMOKE_BASE / CN CDN)
  --skip-smoke         Do not HTTP-smoke after upload
  --dry-run            Print plan; do not upload
  --help, -h

Env:
  FTP_HOST, FTP_USERNAME, FTP_PASSWORD
  FTP_PORT, FTP_SECURE, FTP_REMOTE_DIR (default /)
  OPPTRIX_UPDATE_CDN_BASE, HOT_FTP_SMOKE_BASE
`

/**
 * @param {string[]} argv
 */
function parseArgs(argv) {
  /** @type {{
   *   dir: string,
   *   version: string | null,
   *   cdnBase: string | null,
   *   smokeBase: string | null,
   *   skipSmoke: boolean,
   *   dryRun: boolean,
   *   help: boolean,
   * }} */
  const opts = {
    dir: path.resolve(__dirname, '..', 'dist-runtime'),
    version: process.env.OPPTRIX_APP_VERSION?.trim() || null,
    cdnBase: process.env.OPPTRIX_UPDATE_CDN_BASE?.trim() || null,
    smokeBase: process.env.HOT_FTP_SMOKE_BASE?.trim() || null,
    skipSmoke: false,
    dryRun: false,
    help: false,
  }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--help' || a === '-h') opts.help = true
    else if (a === '--dry-run') opts.dryRun = true
    else if (a === '--skip-smoke') opts.skipSmoke = true
    else if (a === '--dir') opts.dir = path.resolve(String(argv[++i] ?? ''))
    else if (a === '--version') opts.version = String(argv[++i] ?? '').trim() || null
    else if (a === '--cdn-base') opts.cdnBase = String(argv[++i] ?? '').trim() || null
    else if (a === '--smoke-base') opts.smokeBase = String(argv[++i] ?? '').trim() || null
    else {
      console.error(`Unknown argument: ${a}`)
      process.exit(2)
    }
  }
  return opts
}

/**
 * @param {number} bytes
 */
function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`
}

/**
 * @param {string} smokeBase
 * @param {string} version
 */
async function smokeCnCheckUpdate(smokeBase, version) {
  const url = hotCheckUpdateUrl(smokeBase)
  console.log(`[ftp:hot] smoke GET ${url}`)
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), 30_000)
  try {
    const res = await fetch(url, { signal: ac.signal, redirect: 'follow' })
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`)
    }
    const body = await res.text()
    const json = JSON.parse(body)
    if (!json?.latest || json.latest.version !== version) {
      throw new Error(`latest.version mismatch: ${json?.latest?.version} expected ${version}`)
    }
    if (!json.retention || json.retention.max !== HOT_RELEASES_RETENTION_MAX) {
      throw new Error(`retention.max expected ${HOT_RELEASES_RETENTION_MAX}`)
    }
    console.log(`[ftp:hot] smoke OK — latest=${json.latest.version}`)
  } finally {
    clearTimeout(timer)
  }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2))
  if (opts.help) {
    process.stdout.write(HELP)
    process.exit(0)
  }

  if (!String(process.env.FTP_HOST ?? '').trim()) {
    console.log('[ftp:hot] FTP_HOST not set — skipping sync')
    return
  }

  if (!opts.version) {
    console.error('Need --version or OPPTRIX_APP_VERSION')
    process.exit(2)
  }

  const cdnBase = normalizeCdnBase(opts.cdnBase)
  const plan = resolveHotMultiArchUploadPlan(opts.dir, opts.version)
  const description = loadReleaseNotesForVersion(plan.version)
  const { releasesManifest, checkUpdate: payload, merged } = await prepareHotReleaseSync({
    version: plan.version,
    cdnBase,
    packages: plan.packages,
    description,
    nodeRange: process.env.OPPTRIX_RUNTIME_NODE_RANGE?.trim(),
    minBaseImage: process.env.OPPTRIX_MIN_BASE_IMAGE?.trim(),
    mirrorOpts: {
      tag: process.env.OPPTRIX_RUNTIME_RELEASE_TAG?.trim()
        || process.env.OPPTRIX_HOT_MIRROR_TAG?.trim()
        || undefined,
    },
  })
  const checkUpdateJson = `${JSON.stringify(payload, null, 2)}\n`
  const releasesJson = `${JSON.stringify(releasesManifest, null, 2)}\n`
  const retainedVersions = merged.map((e) => e.version)
  const keepNames = buildHotPackageKeepNames(retainedVersions)

  /** @type {Array<{ objectKey: string, localPath: string, size: number }>} */
  const packageUploads = []
  for (const archPlan of plan.archPlans) {
    packageUploads.push({
      objectKey: archPlan.files.packageKey,
      localPath: archPlan.files.binPath,
      size: archPlan.binSize,
    })
    packageUploads.push({
      objectKey: archPlan.files.sha256Key,
      localPath: archPlan.files.sha256Path,
      size: fs.statSync(archPlan.files.sha256Path).size,
    })
  }
  if (plan.legacy) {
    const legacyBin = plan.legacy.binPath
    const legacyAlreadyUploaded = plan.archPlans.some(
      (p) => p.archKey === 'linux-x64' && p.files.binPath === legacyBin,
    )
    if (!legacyAlreadyUploaded) {
      packageUploads.push({
        objectKey: plan.legacy.packageKey,
        localPath: plan.legacy.binPath,
        size: fs.statSync(plan.legacy.binPath).size,
      })
      packageUploads.push({
        objectKey: plan.legacy.sha256Key,
        localPath: plan.legacy.sha256Path,
        size: fs.statSync(plan.legacy.sha256Path).size,
      })
    }
  }

  const ftp = requireHotFtpEnv()
  const totalBytes = packageUploads.reduce((sum, f) => sum + f.size, 0)

  console.log(`[ftp:hot] version=${plan.version} manifestCdn=${cdnBase}`)
  console.log(`[ftp:hot] host=${ftp.host}:${ftp.port} secure=${ftp.secure}`)
  console.log(`[ftp:hot] remoteRoot=${ftp.remoteDir}`)
  console.log(
    `[ftp:hot] packages=${packageUploads.length} (${formatBytes(totalBytes)}), `
      + `retention=${retainedVersions.length}/${HOT_RELEASES_RETENTION_MAX}`,
  )
  console.log(`[ftp:hot] check-update URL (authoritative)=${hotCheckUpdateUrl(cdnBase)}`)
  console.log(`[ftp:hot] releases URL (authoritative)=${hotReleasesUrl(cdnBase)}`)
  console.log(
    `[ftp:hot] keep versions: ${retainedVersions.join(', ') || '(none)'}`,
  )

  if (opts.dryRun) {
    console.log('[ftp:hot] dry-run: no upload')
    for (const item of packageUploads) {
      console.log(`[ftp:hot] would upload ${joinHotFtpRemotePath(ftp.remoteDir, item.objectKey)}`)
    }
    console.log(`[ftp:hot] would overwrite ${joinHotFtpRemotePath(ftp.remoteDir, HOT_CHECK_UPDATE_KEY)}`)
    console.log(`[ftp:hot] would overwrite ${joinHotFtpRemotePath(ftp.remoteDir, HOT_RELEASES_KEY)}`)
    console.log(`[ftp:hot] would prune ${HOT_PACKAGES_PREFIX} outside keep set (${keepNames.size} names)`)
    process.exit(0)
  }

  const { Client } = await import('basic-ftp')
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
    // basic-ftp mutates CWD; freeze login home and always re-enter before relative paths.
    const loginHome = await captureHotFtpLoginHome(client)
    console.log(`[ftp:hot] loginHome=${loginHome}`)

    // Ensure hot/ and hot/packages/ exist (create only when missing).
    await ensureRemoteDirIfMissing(
      client,
      joinHotFtpRemotePath(ftp.remoteDir, 'hot'),
      loginHome,
    )
    await ensureRemoteDirIfMissing(
      client,
      joinHotFtpRemotePath(ftp.remoteDir, HOT_PACKAGES_PREFIX),
      loginHome,
    )

    for (const item of packageUploads) {
      const abs = await uploadHotFtpFile(
        client,
        ftp.remoteDir,
        item.objectKey,
        item.localPath,
        loginHome,
      )
      console.log(`[ftp:hot] uploaded ${abs} (${formatBytes(item.size)})`)
    }

    // Manifests after packages so feed never points at missing bins.
    const checkPath = await uploadHotFtpText(
      client,
      ftp.remoteDir,
      HOT_CHECK_UPDATE_KEY,
      checkUpdateJson,
      loginHome,
    )
    console.log(`[ftp:hot] overwrote ${checkPath}`)
    const releasesPath = await uploadHotFtpText(
      client,
      ftp.remoteDir,
      HOT_RELEASES_KEY,
      releasesJson,
      loginHome,
    )
    console.log(`[ftp:hot] overwrote ${releasesPath}`)

    const { pruned, kept } = await pruneHotFtpPackages(
      client,
      ftp.remoteDir,
      keepNames,
      loginHome,
    )
    console.log(
      `[ftp:hot] prune done — removed ${pruned.length}, kept ${kept.length} package artifact(s)`,
    )
    if (kept.length > 0) {
      console.log(`[ftp:hot] kept: ${kept.join(', ')}`)
    }
    if (pruned.length > 0) {
      console.log(`[ftp:hot] pruned: ${pruned.join(', ')}`)
    }

    console.log('[ftp:hot] sync complete')
  } finally {
    client.close()
  }

  if (!opts.skipSmoke) {
    const smokeBase = normalizeCdnBase(opts.smokeBase || DEFAULT_CN_HOT_CDN_BASE)
    try {
      await smokeCnCheckUpdate(smokeBase, plan.version)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.warn(`[ftp:hot] smoke warning (CDN may need propagation): ${msg}`)
    }
  }
}

main().catch((err) => {
  console.error('[ftp:hot] sync failed:', err instanceof Error ? err.message : err)
  process.exit(1)
})
