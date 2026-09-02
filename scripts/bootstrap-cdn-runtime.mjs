#!/usr/bin/env node
/**
 * Docker A′ boot: optionally pull newer CDN runtime into system slots + pendingVersion.
 * Soft-fails (exit 0) so bundled /app seed still boots. Exit 1 only on usage bugs.
 *
 * Usage: node scripts/bootstrap-cdn-runtime.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { parsePackageMirrors } from './lib/runtime-release-mirrors.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '..')
const DEFAULT_CDN = 'https://update.opptrix.org'
const P = '[bootstrap-cdn]'

const log = (m) => process.stderr.write(`${P} ${m}\n`)
const soft = (m) => { if (m) log(m); process.exit(0) }

async function loadSystemUpdate() {
  const candidates = [
    path.join(REPO_ROOT, 'packages', 'system-update', 'dist', 'index.js'),
    path.join(process.cwd(), 'packages', 'system-update', 'dist', 'index.js'),
    '/app/packages/system-update/dist/index.js',
  ]
  for (const p of candidates) {
    if (fs.existsSync(p)) return import(pathToFileURL(p).href)
  }
  throw new Error('Cannot load @opptrix/system-update dist')
}

/** @returns {'linux-x64' | 'linux-arm64'} */
const resolveLinuxArchKey = () => (process.arch === 'arm64' ? 'linux-arm64' : 'linux-x64')

function cdnCheckDisabled() {
  const raw = (process.env.OPPTRIX_BOOT_CDN_CHECK ?? '').trim().toLowerCase()
  return raw === '0' || raw === 'false' || raw === 'off'
}

function bootTimeoutMs() {
  const n = Number(process.env.OPPTRIX_BOOT_CDN_TIMEOUT_MS || 12_000)
  return Number.isFinite(n) && n > 0 ? n : 12_000
}

function resolveUrl(base, ref) {
  const t = ref.trim()
  if (/^https?:\/\//i.test(t)) return t
  const b = base.replace(/\/+$/, '')
  return t.startsWith('/') ? `${b}${t}` : `${b}/${t}`
}

/**
 * @param {Record<string, unknown>} latest
 * @param {string} cdnBase
 * @param {'linux-x64' | 'linux-arm64'} archKey
 */
function parseLatestPackage(latest, cdnBase, archKey) {
  const version = (typeof latest.version === 'string' ? latest.version.trim() : '').replace(/^v/i, '')
  if (!/^\d+\.\d+\.\d+/.test(version)) return null

  const packages = latest.packages
  if (typeof packages === 'object' && packages !== null) {
    const pkg = /** @type {Record<string, unknown>} */ (packages)[archKey]
    if (typeof pkg === 'object' && pkg !== null) {
      const p = /** @type {Record<string, unknown>} */ (pkg)
      const bin = typeof p.bin === 'string' ? p.bin.trim() : ''
      const sha = typeof p.sha256 === 'string' ? p.sha256.trim() : ''
      if (bin && sha) {
        const mirrors = parsePackageMirrors(p)
        return {
          version,
          binUrl: resolveUrl(cdnBase, bin),
          sha256Url: resolveUrl(cdnBase, sha),
          mirrors: mirrors.github || mirrors.gitee ? mirrors : undefined,
          requires: latest.requires,
        }
      }
    }
  }

  if (archKey !== 'linux-x64') return null
  const binRef = typeof latest.bin === 'string' ? latest.bin.trim() : ''
  const shaRef = typeof latest.sha256 === 'string' ? latest.sha256.trim() : ''
  if (!binRef || !shaRef) return null
  const mirrors = parsePackageMirrors(latest)
  return {
    version,
    binUrl: resolveUrl(cdnBase, binRef),
    sha256Url: resolveUrl(cdnBase, shaRef),
    mirrors: mirrors.github || mirrors.gitee ? mirrors : undefined,
    requires: latest.requires,
  }
}

/** @param {Awaited<ReturnType<typeof loadSystemUpdate>>} su */
function resolveCurrentVersion(su) {
  const boot = su.readBootVersion(su.resolveSystemDir())
  if (boot) return boot
  return process.env.OPPTRIX_APP_VERSION?.trim()
    || process.env.OPPTRIX_SEED_VERSION?.trim()
    || '0.0.0'
}

/** @param {Awaited<ReturnType<typeof loadSystemUpdate>>} su */
function evalRequires(su, markerOrRequires, version) {
  const marker = markerOrRequires && typeof markerOrRequires === 'object' && 'requires' in markerOrRequires
    ? markerOrRequires
    : {
        app: 'opptrix',
        kind: 'runtime',
        version,
        requires: markerOrRequires && typeof markerOrRequires === 'object' ? markerOrRequires : undefined,
        hooks: { postActivate: [] },
      }
  return su.evaluateRuntimeRequires(marker, {
    isDocker: su.isDockerEnv(),
    baseVersion: su.resolveHostBaseVersion(),
  })
}

async function main() {
  const argv = process.argv.slice(2)
  if (argv.includes('--help') || argv.includes('-h')) {
    process.stderr.write('Usage: node scripts/bootstrap-cdn-runtime.mjs\n')
    process.exit(0)
  }
  if (argv.length > 0) {
    process.stderr.write(`${P} unknown arguments: ${argv.join(' ')}\n`)
    process.exit(1)
  }
  if (cdnCheckDisabled()) soft('skip: OPPTRIX_BOOT_CDN_CHECK disabled')

  let su
  try {
    su = await loadSystemUpdate()
  } catch (err) {
    soft(`skip: ${err instanceof Error ? err.message : String(err)}`)
  }

  try {
    const root = su.resolveSystemDir()
    su.ensureLayout(root)
    const paths = su.resolveSystemPaths(root)
    const current = resolveCurrentVersion(su)
    const archKey = resolveLinuxArchKey()
    const cdnBase = (process.env.OPPTRIX_UPDATE_CDN_BASE ?? DEFAULT_CDN).trim().replace(/\/+$/, '') || DEFAULT_CDN
    const timeoutMs = bootTimeoutMs()
    const url = `${cdnBase}/hot/check-update`
    log(`check ${url} current=${current} arch=${archKey} timeout=${timeoutMs}ms`)

    const ac = new AbortController()
    const timer = setTimeout(() => ac.abort(), timeoutMs)
    let body
    try {
      const res = await fetch(url, {
        headers: {
          Accept: 'application/json',
          'User-Agent': `Opptrix-bootstrap-cdn/${current} (${archKey})`,
        },
        signal: ac.signal,
      })
      if (!res.ok) throw new Error(`check-update HTTP ${res.status}`)
      body = await res.json()
    } finally {
      clearTimeout(timer)
    }

    const latestRow =
      typeof body === 'object' && body !== null
        ? /** @type {Record<string, unknown>} */ (body).latest
        : null
    if (typeof latestRow !== 'object' || latestRow === null) soft('skip: check-update missing latest')
    const pkg = parseLatestPackage(/** @type {Record<string, unknown>} */ (latestRow), cdnBase, archKey)
    if (!pkg) soft(`skip: no package for arch ${archKey}`)
    if (su.compareSemver(pkg.version, current) <= 0) {
      soft(`skip: latest ${pkg.version} <= current ${current}`)
    }

    if (pkg.requires && typeof pkg.requires === 'object') {
      const check = evalRequires(su, pkg.requires, pkg.version)
      if (check.needsBaseRefresh) {
        soft(`skip: needsBaseRefresh for ${pkg.version} (${(check.reasons || []).join('; ') || 'base incompatible'})`)
      }
    }

    const archivePath = path.join(paths.updateDir, `opptrix-runtime-${archKey}-v${pkg.version}.bin`)
    const shaPath = archivePath.replace(/\.bin$/, '.sha256')
    log(`download ${pkg.version} → ${archivePath}`)

    const { source, bytes } = await su.downloadRuntimeAssetPair(
      { binUrl: pkg.binUrl, sha256Url: pkg.sha256Url, mirrors: pkg.mirrors },
      {
        binDest: archivePath,
        shaDest: shaPath,
        headers: { 'User-Agent': `Opptrix-bootstrap-cdn/${pkg.version} (${archKey})` },
        timeoutMs: Math.max(timeoutMs, 60_000),
        shaTimeoutMs: timeoutMs,
        probeNetwork: true,
      },
    )

    const extracted = su.extractUpdateArchive({
      archivePath,
      version: pkg.version,
      systemDir: root,
      sha256Path: shaPath,
      markPending: true,
    })

    const post = evalRequires(su, su.readRuntimeMarker(extracted.slotPath), pkg.version)
    if (post.needsBaseRefresh) {
      soft(
        `staged ${pkg.version} but needsBaseRefresh (${(post.reasons || []).join('; ') || 'base incompatible'});`
          + ' pending kept for activate-pending skip',
      )
    }

    const state = su.readState(root)
    log(`ok version=${pkg.version} source=${source} bytes=${bytes} slot=${extracted.slotPath} pending=${state.pendingVersion ?? 'none'}`)
    process.exit(0)
  } catch (err) {
    soft(`soft-fail: ${err instanceof Error ? err.message : String(err)}`)
  }
}

main().catch((err) => soft(`soft-fail: ${err instanceof Error ? err.message : String(err)}`))
