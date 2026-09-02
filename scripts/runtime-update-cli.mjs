#!/usr/bin/env node
/**
 * In-container runtime hot-update CLI (invoked via docker exec / compose run).
 * Host: opptrix runtime … — never uses HTTP API.
 *
 * Subcommands (append --json for machine-readable last line):
 *   status
 *   list-local
 *   fetch-latest
 *   fetch-releases
 *   use <version|latest>
 *   apply
 *   rollback
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '..')

const DEFAULT_CDN = 'https://update.opptrix.org'

/**
 * @param {boolean} json
 * @param {Record<string, unknown>} payload
 */
function emit(json, payload) {
  if (json) {
    process.stdout.write(`${JSON.stringify(payload)}\n`)
  }
}

/**
 * @param {boolean} json
 * @param {number} code
 * @param {Record<string, unknown>} payload
 */
function exitWith(json, code, payload) {
  emit(json, { ok: code === 0, exitCode: code, ...payload })
  process.exit(code)
}

async function loadSystemUpdate() {
  const candidates = [
    path.join(REPO_ROOT, 'packages', 'system-update', 'dist', 'index.js'),
    path.join(process.cwd(), 'packages', 'system-update', 'dist', 'index.js'),
    '/app/packages/system-update/dist/index.js',
  ]
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      return import(pathToFileURL(p).href)
    }
  }
  throw new Error('Cannot load @opptrix/system-update dist')
}

/**
 * @returns {'linux-x64' | 'linux-arm64'}
 */
function resolveLinuxArchKey() {
  return process.arch === 'arm64' ? 'linux-arm64' : 'linux-x64'
}

function buildUserAgent(version) {
  const v = String(version ?? 'unknown').replace(/^v/i, '')
  const arch = resolveLinuxArchKey()
  if (!v || v === 'unknown') return `Opptrix-system-update (${arch})`
  return `Opptrix-system-update/${v} (${arch})`
}

/**
 * @param {string} cdnBase
 */
function hotCheckUpdateUrl(cdnBase) {
  return `${cdnBase.replace(/\/+$/, '')}/hot/check-update`
}

function hotReleasesUrl(cdnBase) {
  return `${cdnBase.replace(/\/+$/, '')}/hot/releases`
}

/**
 * @param {unknown} raw
 */
function parseReleaseDescription(raw) {
  if (typeof raw !== 'object' || raw === null) {
    return { features: [], fixes: [] }
  }
  const row = /** @type {Record<string, unknown>} */ (raw)
  const features = Array.isArray(row.features)
    ? row.features.filter((x) => typeof x === 'string' && x.trim()).map((s) => s.trim())
    : []
  const fixes = Array.isArray(row.fixes)
    ? row.fixes.filter((x) => typeof x === 'string' && x.trim()).map((s) => s.trim())
    : []
  return { features, fixes }
}

/**
 * @param {Record<string, unknown>} row
 * @param {string} cdnBase
 */
function parseReleasePackage(row, cdnBase) {
  const versionRaw = typeof row.version === 'string' ? row.version.trim() : ''
  const version = versionRaw.replace(/^v/i, '')
  if (!/^\d+\.\d+\.\d+/.test(version)) return null

  const archKey = resolveLinuxArchKey()
  const packages = row.packages
  if (typeof packages === 'object' && packages !== null) {
    const pkg = /** @type {Record<string, unknown>} */ (packages)[archKey]
    if (typeof pkg === 'object' && pkg !== null) {
      const p = /** @type {Record<string, unknown>} */ (pkg)
      const bin = typeof p.bin === 'string' ? p.bin.trim() : ''
      const sha = typeof p.sha256 === 'string' ? p.sha256.trim() : ''
      if (bin && sha) {
        return {
          version,
          binUrl: resolveUrl(cdnBase, bin),
          sha256Url: resolveUrl(cdnBase, sha),
          size: typeof p.size === 'number' ? p.size : null,
          archKey,
          requires: row.requires ?? {},
          publishedAt: typeof row.publishedAt === 'string' ? row.publishedAt : null,
          description: parseReleaseDescription(row.description),
        }
      }
    }
  }

  const binRef = typeof row.bin === 'string' ? row.bin.trim() : ''
  const shaRef = typeof row.sha256 === 'string' ? row.sha256.trim() : ''
  if (archKey !== 'linux-x64') return null
  if (!binRef || !shaRef) return null
  return {
    version,
    binUrl: resolveUrl(cdnBase, binRef),
    sha256Url: resolveUrl(cdnBase, shaRef),
    size: typeof row.size === 'number' ? row.size : null,
    archKey,
    requires: row.requires ?? {},
    publishedAt: typeof row.publishedAt === 'string' ? row.publishedAt : null,
    description: parseReleaseDescription(row.description),
  }
}

/**
 * @param {unknown} raw
 * @param {string} cdnBase
 */
function parseLatestPackage(raw, cdnBase) {
  if (typeof raw !== 'object' || raw === null) return null
  const latest = /** @type {Record<string, unknown>} */ (raw).latest
  if (typeof latest !== 'object' || latest === null) return null
  return parseReleasePackage(/** @type {Record<string, unknown>} */ (latest), cdnBase)
}

/**
 * @param {unknown} raw
 * @param {string} cdnBase
 */
function parseReleasesManifest(raw, cdnBase) {
  if (typeof raw !== 'object' || raw === null) return []
  const releases = /** @type {Record<string, unknown>} */ (raw).releases
  if (!Array.isArray(releases)) return []
  /** @type {Array<NonNullable<ReturnType<typeof parseReleasePackage>>>} */
  const out = []
  for (const row of releases) {
    if (typeof row !== 'object' || row === null) continue
    const parsed = parseReleasePackage(/** @type {Record<string, unknown>} */ (row), cdnBase)
    if (parsed) out.push(parsed)
  }
  return out
}

/**
 * @param {string} base
 * @param {string} ref
 */
function resolveUrl(base, ref) {
  const trimmed = ref.trim()
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  const b = base.replace(/\/+$/, '')
  if (trimmed.startsWith('/')) return `${b}${trimmed}`
  return `${b}/${trimmed}`
}

/**
 * @param {string} url
 * @param {string} dest
 * @param {Record<string, string>} headers
 */
async function downloadFile(url, dest, headers) {
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), 180_000)
  try {
    const res = await fetch(url, { headers, signal: ac.signal })
    if (!res.ok) throw new Error(`download failed (${res.status})`)
    const buf = Buffer.from(await res.arrayBuffer())
    fs.mkdirSync(path.dirname(dest), { recursive: true })
    fs.writeFileSync(dest, buf)
    return buf.length
  } finally {
    clearTimeout(timer)
  }
}

/**
 * @param {string} dir
 */
function listSlotVersions(dir) {
  const slots = path.join(dir, 'slots')
  if (!fs.existsSync(slots)) return []
  return fs.readdirSync(slots, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .filter((n) => /^\d+\.\d+\.\d+/.test(n))
    .sort((a, b) => {
      const pa = a.split('.').map(Number)
      const pb = b.split('.').map(Number)
      for (let i = 0; i < 3; i++) {
        if (pa[i] !== pb[i]) return pb[i] - pa[i]
      }
      return 0
    })
}

/**
 * @param {Awaited<ReturnType<typeof loadSystemUpdate>>} su
 */
function buildStatus(su) {
  const root = su.resolveSystemDir()
  su.ensureLayout(root)
  const state = su.readState(root)
  const boot = su.readBootVersion(root)
  return {
    systemDir: root,
    currentVersion: state.currentVersion ?? boot,
    pendingVersion: state.pendingVersion,
    backupVersion: state.backupVersion,
    uiPhase: state.uiPhase,
    blockedVersions: state.blockedVersions ?? [],
    slots: listSlotVersions(root),
    baseVersion: su.resolveHostBaseVersion(),
    arch: resolveLinuxArchKey(),
  }
}

/**
 * @param {Awaited<ReturnType<typeof loadSystemUpdate>>} su
 * @param {boolean} json
 */
async function fetchLatestPayload(su) {
  const cdnBase = (process.env.OPPTRIX_UPDATE_CDN_BASE ?? DEFAULT_CDN).trim() || DEFAULT_CDN
  const current = su.readState().currentVersion ?? 'unknown'
  const url = hotCheckUpdateUrl(cdnBase)
  const res = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': buildUserAgent(current),
    },
    signal: AbortSignal.timeout(30_000),
  })
  if (!res.ok) throw new Error(`check-update failed (${res.status})`)
  const body = await res.json()
  const latest = parseLatestPackage(body, cdnBase)
  if (!latest) throw new Error('check-update payload missing package for this arch')
  return { latest, cdnBase, body }
}

async function fetchReleasesPayload(su) {
  const cdnBase = (process.env.OPPTRIX_UPDATE_CDN_BASE ?? DEFAULT_CDN).trim() || DEFAULT_CDN
  const current = su.readState().currentVersion ?? 'unknown'
  const url = hotReleasesUrl(cdnBase)
  const res = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': buildUserAgent(current),
    },
    signal: AbortSignal.timeout(30_000),
  })
  if (!res.ok) throw new Error(`releases manifest failed (${res.status})`)
  const body = await res.json()
  const releases = parseReleasesManifest(body, cdnBase)
  if (releases.length === 0) throw new Error('releases manifest empty for this arch')
  return { releases, cdnBase, retention: body?.retention ?? null }
}

/**
 * @param {Awaited<ReturnType<typeof loadSystemUpdate>>} su
 * @param {NonNullable<ReturnType<typeof parseReleasePackage>>} pkg
 * @param {string} source
 * @param {string} current
 */
async function stageReleasePackage(su, pkg, source, current) {
  const state = su.readState()
  if (pkg.version === current && !state.pendingVersion) {
    return {
      command: 'use',
      version: pkg.version,
      source,
      alreadyCurrent: true,
      needsApply: false,
    }
  }

  const paths = su.resolveSystemPaths()
  su.ensureLayout(paths.systemDir)
  const binName = `opptrix-runtime-${pkg.archKey}-v${pkg.version}.bin`
  const archivePath = path.join(paths.updateDir, binName)
  const shaSidecar = archivePath.replace(/\.bin$/, '.sha256')

  const headers = { 'User-Agent': buildUserAgent(pkg.version) }
  await downloadFile(pkg.binUrl, archivePath, headers)
  await downloadFile(pkg.sha256Url, shaSidecar, headers)

  const extracted = su.extractUpdateArchive({
    archivePath,
    version: pkg.version,
    sha256Path: shaSidecar,
    markPending: true,
  })

  const requiresCheck = su.evaluateRuntimeRequires(su.readRuntimeMarker(extracted.slotPath), {
    isDocker: su.isDockerEnv(),
    baseVersion: su.resolveHostBaseVersion(),
  })

  return {
    command: 'use',
    version: pkg.version,
    source,
    slotPath: extracted.slotPath,
    needsApply: true,
    needsBaseRefresh: requiresCheck.needsBaseRefresh,
    baseRefreshReasons: requiresCheck.reasons,
    fromVersion: current,
    description: pkg.description,
  }
}

/**
 * @param {Awaited<ReturnType<typeof loadSystemUpdate>>} su
 * @param {boolean} json
 */
async function cmdFetchLatest(su, json) {
  const { latest, cdnBase } = await fetchLatestPayload(su)
  exitWith(json, 0, { command: 'fetch-latest', latest, cdnBase })
}

async function cmdFetchReleases(su, json) {
  const { releases, cdnBase, retention } = await fetchReleasesPayload(su)
  exitWith(json, 0, { command: 'fetch-releases', releases, cdnBase, retention })
}

/**
 * @param {Awaited<ReturnType<typeof loadSystemUpdate>>} su
 * @param {string | null} target
 * @param {boolean} json
 */
async function cmdUse(su, target, json) {
  const state = su.readState()
  const current = state.currentVersion ?? su.readBootVersion() ?? 'unknown'

  if (target && target !== 'latest') {
    const normalized = target.replace(/^v/i, '')
    const slot = su.slotPath(su.resolveSystemDir(), normalized)
    if (fs.existsSync(slot)) {
      su.setPendingVersion(normalized)
      exitWith(json, 0, {
        command: 'use',
        version: normalized,
        source: 'local-slot',
        needsApply: true,
        fromVersion: current,
      })
    }

    const { releases } = await fetchReleasesPayload(su)
    const pkg = releases.find((r) => r.version === normalized)
    if (!pkg) {
      throw new Error(
        `runtime ${normalized} 不在 CDN 保留列表中（最近 8 版）；可用: ${releases.map((r) => r.version).join(', ')}`,
      )
    }
    const result = await stageReleasePackage(su, pkg, 'cdn-release', current)
    exitWith(json, 0, result)
    return
  }

  const { latest } = await fetchLatestPayload(su)
  const result = await stageReleasePackage(su, latest, 'cdn', current)
  exitWith(json, 0, result)
}

/**
 * @param {Awaited<ReturnType<typeof loadSystemUpdate>>} su
 * @param {boolean} json
 */
async function cmdApply(su, json) {
  const state = su.readState()
  if (!state.pendingVersion) {
    throw new Error('没有待应用的 runtime 版本；请先 opptrix runtime use')
  }
  const check = su.evaluateRuntimeRequires(
    su.readRuntimeMarker(su.slotPath(su.resolveSystemDir(), state.pendingVersion)),
    { isDocker: su.isDockerEnv(), baseVersion: su.resolveHostBaseVersion() },
  )
  if (check.needsBaseRefresh) {
    exitWith(json, 2, {
      command: 'apply',
      code: 'needs_base_refresh',
      pendingVersion: state.pendingVersion,
      reasons: check.reasons,
      hint: '请先 opptrix base use <版本> --apply',
    })
  }
  const result = su.activatePending()
  exitWith(json, 0, {
    command: 'apply',
    previousVersion: result.previousVersion,
    currentVersion: result.currentVersion,
    needsRestart: true,
    note: 'host should docker restart to run first-boot hooks',
  })
}

/**
 * @param {Awaited<ReturnType<typeof loadSystemUpdate>>} su
 * @param {boolean} json
 */
async function cmdRollback(su, json) {
  const before = su.readState()
  const result = await su.rollbackToBackup()
  exitWith(json, 0, {
    command: 'rollback',
    fromVersion: result.fromVersion,
    toVersion: result.toVersion,
    previousBackup: before.backupVersion,
    needsRestart: true,
  })
}

function parseArgs(argv) {
  const json = argv.includes('--json')
  const filtered = argv.filter((a) => a !== '--json')
  const cmd = filtered[0] ?? ''
  const rest = filtered.slice(1)
  return { cmd, rest, json }
}

async function main() {
  const { cmd, rest, json } = parseArgs(process.argv.slice(2))
  const su = await loadSystemUpdate()

  try {
    switch (cmd) {
      case 'status':
        exitWith(json, 0, { command: 'status', ...buildStatus(su) })
      case 'list-local':
        exitWith(json, 0, { command: 'list-local', ...buildStatus(su) })
      case 'fetch-latest':
        await cmdFetchLatest(su, json)
        break
      case 'fetch-releases':
        await cmdFetchReleases(su, json)
        break
      case 'use':
        await cmdUse(su, rest[0] ?? 'latest', json)
        break
      case 'apply':
        await cmdApply(su, json)
        break
      case 'rollback':
        await cmdRollback(su, json)
        break
      default:
        process.stderr.write(
          'Usage: runtime-update-cli.mjs {status|list-local|fetch-latest|fetch-releases|use|apply|rollback} [--json]\n',
        )
        process.exit(2)
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (!json) process.stderr.write(`[runtime-update] ERROR: ${message}\n`)
    exitWith(json, 1, { command: cmd || 'unknown', error: message })
  }
}

main()
