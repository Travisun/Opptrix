#!/usr/bin/env node
/**
 * Pack a built Opptrix monorepo into a hot-update runtime tarball.
 *
 * Shape matches Docker image `/app` after `npm ci && npm run build && npm prune --omit=dev`
 * (see root Dockerfile). Native modules are ABI/platform-specific — prefer packing on
 * **linux CI (glibc)** or from a built image export. Darwin/Windows builds are for
 * dry-run / local experiments only.
 *
 * Outputs (CDN channel — `hotPackageUrls`):
 *   opptrix-runtime-v{VER}.tar.gz          (legacy / local)
 *   opptrix-runtime-v{VER}.tar.gz.sha256
 *   opptrix-runtime-v{VER}.bin             (CDN upload; same bytes as tar.gz)
 *   opptrix-runtime-v{VER}.sha256          (digest for .bin)
 *   optional: opptrix-runtime-{platform}-{arch}-v{VER}.tar.gz(+.sha256)
 *
 * Usage:
 *   node scripts/pack-opptrix-runtime.mjs --version 1.4.0
 *   OPPTRIX_APP_VERSION=1.4.0 node scripts/pack-opptrix-runtime.mjs
 *   node scripts/pack-opptrix-runtime.mjs --help
 *   node scripts/pack-opptrix-runtime.mjs --dry-run --version 1.4.0
 */
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DEFAULT_ROOT = path.resolve(__dirname, '..')

const HELP = `Usage: node scripts/pack-opptrix-runtime.mjs [options]

Pack a built monorepo (or Docker-exported /app tree) into release assets:
  opptrix-runtime-v{VER}.tar.gz
  opptrix-runtime-v{VER}.tar.gz.sha256
  opptrix-runtime-v{VER}.bin              (CDN; identical to tar.gz)
  opptrix-runtime-v{VER}.sha256           (digest sidecar for .bin)

Options:
  --version <semver>   App version (or OPPTRIX_APP_VERSION / package.json)
  --root <dir>         Tree to pack (default: repo root)
  --out-dir <dir>      Output directory (default: <root>/dist-runtime)
  --also-platform-name Also write opptrix-runtime-{platform}-{arch}-v{VER}.tar.gz
  --dry-run            Print plan / excludes; do not write archives
  --skip-built-check   Do not require apps/server/dist/index.js
  --help, -h           Show this help

Env:
  OPPTRIX_APP_VERSION  Same as --version
  OPPTRIX_PACK_ROOT    Same as --root
  OPPTRIX_PACK_OUT     Same as --out-dir

Preferred CI flow (ubuntu-latest):
  npm ci && npm run build && npm prune --omit=dev
  node scripts/pack-opptrix-runtime.mjs --version "$VERSION" --also-platform-name

Asset names must match apps/server hotPackageUrls /
@opptrix/system-update runtimeArchiveFilename.
`

/** Paths / globs relative to pack root — excluded from the tarball. */
const EXCLUDE_ARGS = [
  '--exclude=.git',
  '--exclude=.github',
  '--exclude=.cursor',
  '--exclude=.codegraph',
  '--exclude=.mimocode',
  '--exclude=.agents',
  '--exclude=.vscode',
  '--exclude=.idea',
  '--exclude=author',
  '--exclude=tests',
  '--exclude=docs',
  '--exclude=dist-runtime',
  '--exclude=apps/desktop',
  '--exclude=**/__fixtures__',
  '--exclude=**/*.test.ts',
  '--exclude=**/*.test.mjs',
  '--exclude=**/*.spec.ts',
  '--exclude=**/*.tsbuildinfo',
  '--exclude=**/.turbo',
  '--exclude=.npm',
  '--exclude=.cache',
  '--exclude=coverage',
  '--exclude=.nyc_output',
  '--exclude=.env',
  '--exclude=.env.*',
  '--exclude=*.dmg',
  '--exclude=*.AppImage',
  '--exclude=*.exe',
  '--exclude=*.blockmap',
  '--exclude=screenshot.webp',
  // Do not nest previous packs
  '--exclude=opptrix-runtime-v*.tar.gz',
  '--exclude=opptrix-runtime-v*.tar.gz.sha256',
  '--exclude=opptrix-runtime-v*.bin',
  '--exclude=opptrix-runtime-v*.sha256',
  '--exclude=opptrix-runtime-*-v*.tar.gz',
  '--exclude=opptrix-runtime-*-v*.tar.gz.sha256',
]

/**
 * @param {string[]} argv
 */
function parseArgs(argv) {
  /** @type {{ version: string | null, root: string, outDir: string | null, alsoPlatform: boolean, dryRun: boolean, skipBuiltCheck: boolean, help: boolean }} */
  const opts = {
    version: process.env.OPPTRIX_APP_VERSION?.trim() || null,
    root: process.env.OPPTRIX_PACK_ROOT?.trim() || DEFAULT_ROOT,
    outDir: process.env.OPPTRIX_PACK_OUT?.trim() || null,
    alsoPlatform: false,
    dryRun: false,
    skipBuiltCheck: false,
    help: false,
  }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--help' || a === '-h') opts.help = true
    else if (a === '--dry-run') opts.dryRun = true
    else if (a === '--also-platform-name') opts.alsoPlatform = true
    else if (a === '--skip-built-check') opts.skipBuiltCheck = true
    else if (a === '--version') {
      opts.version = String(argv[++i] ?? '').trim() || null
    } else if (a === '--root') {
      opts.root = path.resolve(String(argv[++i] ?? ''))
    } else if (a === '--out-dir') {
      opts.outDir = path.resolve(String(argv[++i] ?? ''))
    } else if (a.startsWith('--version=')) {
      opts.version = a.slice('--version='.length).trim() || null
    } else {
      console.error(`Unknown argument: ${a}`)
      console.error(HELP)
      process.exit(2)
    }
  }
  return opts
}

/**
 * @param {string} version
 */
function normalizeVersion(version) {
  const v = String(version ?? '').trim().replace(/^v/, '')
  if (!/^\d+\.\d+\.\d+(?:[-+].*)?$/.test(v)) {
    throw new Error(`invalid version "${version}" (expect X.Y.Z)`)
  }
  return v
}

/**
 * @param {string} root
 */
function readPackageVersion(root) {
  const pkgPath = path.join(root, 'package.json')
  if (!fs.existsSync(pkgPath)) return null
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
    return typeof pkg.version === 'string' ? pkg.version : null
  } catch {
    return null
  }
}

/**
 * Canonical + optional platform basename helpers (must match channel picker).
 * @param {string} version
 * @param {'tar.gz'} [ext]
 */
function runtimeArchiveFilename(version, ext = 'tar.gz') {
  return `opptrix-runtime-v${version}.${ext}`
}

/**
 * @param {string} version
 */
function runtimeBinFilename(version) {
  return `opptrix-runtime-v${version}.bin`
}

/**
 * CDN sidecar basename (digest for .bin, not nested under .bin.sha256).
 * @param {string} version
 */
function runtimeBinSha256Filename(version) {
  return `opptrix-runtime-v${version}.sha256`
}

/**
 * @param {string} version
 */
function platformArchiveFilename(version) {
  const platform = process.platform === 'win32' ? 'win32' : process.platform
  const arch = process.arch === 'arm64' ? 'arm64' : 'x64'
  return `opptrix-runtime-${platform}-${arch}-v${version}.tar.gz`
}

/**
 * @param {string} filePath
 */
function sha256File(filePath) {
  const hash = createHash('sha256')
  hash.update(fs.readFileSync(filePath))
  return hash.digest('hex')
}

/**
 * sha256sum format: `<hex>  <basename>\n`
 * @param {string} archivePath
 * @param {string} hex
 * @param {string} [basenameOverride]
 */
function writeSha256Sidecar(archivePath, hex, sidecarName) {
  const archiveBase = path.basename(archivePath)
  const sidecar = sidecarName
    ? path.join(path.dirname(archivePath), sidecarName)
    : `${archivePath}.sha256`
  fs.writeFileSync(sidecar, `${hex}  ${archiveBase}\n`, 'utf8')
  return sidecar
}

/**
 * @param {string} root
 * @param {string} version
 */
function resolveMinBaseImage(version) {
  const fromEnv = process.env.OPPTRIX_MIN_BASE_IMAGE?.trim()
  if (fromEnv) return fromEnv
  const releaseTag = process.env.OPPTRIX_RELEASE_TAG?.trim()
  if (releaseTag?.startsWith('opptrix-selfhost-v')) return releaseTag
  return `opptrix-selfhost-v${version}`
}

/**
 * @param {string} root
 * @param {string} version
 */
function writeRuntimeMarker(root, version) {
  const file = path.join(root, 'opptrix-runtime.json')
  const body = {
    app: 'opptrix',
    kind: 'runtime',
    version,
    requires: {
      node: '>=24 <25',
      minBaseImage: resolveMinBaseImage(version),
    },
    hooks: {
      postActivate: [],
    },
  }
  fs.writeFileSync(file, `${JSON.stringify(body, null, 2)}\n`, 'utf8')
  return file
}

/**
 * @param {string} root
 */
function assertLooksLikeRuntime(root) {
  const server = path.join(root, 'apps', 'server', 'dist', 'index.js')
  const ui = path.join(root, 'client-ui', 'dist', 'index.html')
  const nm = path.join(root, 'node_modules')
  const pkg = path.join(root, 'package.json')
  const missing = []
  if (!fs.existsSync(pkg)) missing.push('package.json')
  if (!fs.existsSync(server)) missing.push('apps/server/dist/index.js')
  if (!fs.existsSync(ui)) missing.push('client-ui/dist/index.html')
  if (!fs.existsSync(nm)) missing.push('node_modules')
  if (missing.length) {
    throw new Error(
      `pack root is not a built runtime tree (missing: ${missing.join(', ')}). `
        + `Run: npm ci && npm run build && npm prune --omit=dev`,
    )
  }
}

/**
 * @param {string} root
 * @param {string} archivePath
 * @param {string} outDir
 */
function runTar(root, archivePath, outDir) {
  // GNU tar on Linux CI; BSD tar on macOS — both support -czf and --exclude.
  /** @type {string[]} */
  const extraExcludes = [
    `--exclude=${path.basename(archivePath)}`,
    `--exclude=${path.basename(archivePath)}.sha256`,
  ]
  const relOut = path.relative(root, outDir)
  if (relOut && !relOut.startsWith('..') && !path.isAbsolute(relOut)) {
    // Do not nest the output directory inside the archive
    extraExcludes.push(`--exclude=${relOut}`)
  }
  const args = [
    '-czf',
    archivePath,
    ...EXCLUDE_ARGS,
    ...extraExcludes,
    '-C',
    root,
    '.',
  ]
  const r = spawnSync('tar', args, { encoding: 'utf8' })
  if (r.status !== 0) {
    throw new Error(`tar failed: ${r.stderr || r.stdout || `exit ${r.status}`}`)
  }
}

function main() {
  const opts = parseArgs(process.argv.slice(2))
  if (opts.help) {
    process.stdout.write(HELP)
    process.exit(0)
  }

  const root = path.resolve(opts.root)
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
    console.error(`pack root missing: ${root}`)
    process.exit(1)
  }

  let version
  try {
    const raw = opts.version || readPackageVersion(root)
    if (!raw) throw new Error('version required (--version or OPPTRIX_APP_VERSION)')
    version = normalizeVersion(raw)
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err))
    process.exit(2)
  }

  const outDir = path.resolve(opts.outDir || path.join(root, 'dist-runtime'))
  const archiveName = runtimeArchiveFilename(version)
  const archivePath = path.join(outDir, archiveName)

  if (process.platform !== 'linux') {
    console.warn(
      `[pack-opptrix-runtime] warning: packing on ${process.platform}/${process.arch}. `
        + `Production assets should be built on linux glibc (CI ubuntu-latest) so native `
        + `modules match Docker runtime.`,
    )
  }

  if (!opts.skipBuiltCheck) {
    try {
      assertLooksLikeRuntime(root)
    } catch (err) {
      console.error(err instanceof Error ? err.message : String(err))
      process.exit(1)
    }
  }

  console.log(`[pack-opptrix-runtime] root=${root}`)
  console.log(`[pack-opptrix-runtime] version=${version}`)
  console.log(`[pack-opptrix-runtime] out=${archivePath}`)
  console.log(`[pack-opptrix-runtime] excludes=${EXCLUDE_ARGS.length} patterns`)

  if (opts.dryRun) {
    console.log('[pack-opptrix-runtime] dry-run: would write marker opptrix-runtime.json')
    console.log(`[pack-opptrix-runtime] dry-run: would create ${archiveName}`)
    console.log(`[pack-opptrix-runtime] dry-run: would create ${archiveName}.sha256`)
    console.log(`[pack-opptrix-runtime] dry-run: would create ${runtimeBinFilename(version)}`)
    console.log(`[pack-opptrix-runtime] dry-run: would create ${runtimeBinSha256Filename(version)}`)
    if (opts.alsoPlatform) {
      console.log(`[pack-opptrix-runtime] dry-run: would also create ${platformArchiveFilename(version)}`)
    }
    process.exit(0)
  }

  fs.mkdirSync(outDir, { recursive: true })
  writeRuntimeMarker(root, version)
  console.log(`[pack-opptrix-runtime] wrote ${path.join(root, 'opptrix-runtime.json')}`)

  if (fs.existsSync(archivePath)) fs.unlinkSync(archivePath)
  runTar(root, archivePath, outDir)
  const hex = sha256File(archivePath)
  const sidecar = writeSha256Sidecar(archivePath, hex)
  const size = fs.statSync(archivePath).size
  console.log(`[pack-opptrix-runtime] wrote ${archivePath} (${size} bytes)`)
  console.log(`[pack-opptrix-runtime] wrote ${sidecar}`)
  console.log(`[pack-opptrix-runtime] sha256 ${hex}`)

  const binName = runtimeBinFilename(version)
  const binPath = path.join(outDir, binName)
  fs.copyFileSync(archivePath, binPath)
  const binShaName = runtimeBinSha256Filename(version)
  const binShaPath = writeSha256Sidecar(binPath, hex, binShaName)
  console.log(`[pack-opptrix-runtime] wrote ${binPath} (CDN alias)`)
  console.log(`[pack-opptrix-runtime] wrote ${binShaPath}`)

  if (opts.alsoPlatform) {
    const platName = platformArchiveFilename(version)
    const platPath = path.join(outDir, platName)
    fs.copyFileSync(archivePath, platPath)
    writeSha256Sidecar(platPath, hex)
    console.log(`[pack-opptrix-runtime] also wrote ${platPath}`)
    console.log(`[pack-opptrix-runtime] also wrote ${platPath}.sha256`)
  }

  console.log('[pack-opptrix-runtime] done')
}

main()
