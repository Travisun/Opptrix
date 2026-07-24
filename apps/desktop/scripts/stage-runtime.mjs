#!/usr/bin/env node
/**
 * Stage a self-contained Node runtime for the desktop sidecar (production bundle).
 *
 * Sidecar runs via Electron's process.execPath + ELECTRON_RUN_AS_NODE:
 * - better-sqlite3: needs Electron ABI prebuild / rebuild
 * - duckdb: N-API — use official Node prebuilds (no Electron binary; source compile is huge/flaky)
 */
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import {
  electronRebuildEnv,
  hostMatchesTarget,
  nodeNativeEnv,
  npmTargetCliArgs,
  resolveRuntimeTarget,
  runNodeScript,
  runNpm,
} from './lib/runtime-target.mjs'

const require = createRequire(import.meta.url)
const nodeAbi = require('node-abi')
const { RUNTIME_DEPS_DIR } = require('../electron/runtime-deps.cjs')

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '../../..')
const DESKTOP_ROOT = path.join(REPO_ROOT, 'apps/desktop')
const STAGE = path.join(DESKTOP_ROOT, 'runtime-stage')
const PLAYWRIGHT_BROWSERS = path.join(STAGE, 'playwright-browsers')
// Keep download cache outside runtime-stage — Apple notarization unpacks nested
// archives and rejects unsigned .node binaries left in staged .cache/prebuilds.
const PREBUILD_CACHE = path.join(DESKTOP_ROOT, '.cache/prebuilds')
const SERVER_PKG_PATH = path.join(REPO_ROOT, 'apps/server/package.json')
/** npm installs into node_modules; renamed to RUNTIME_DEPS_DIR before packaging. */
const STAGE_NM = path.join(STAGE, 'node_modules')
const STAGE_DEPS = path.join(STAGE, RUNTIME_DEPS_DIR)

const DESKTOP_PKG = JSON.parse(fs.readFileSync(path.join(DESKTOP_ROOT, 'package.json'), 'utf8'))
const ELECTRON_VERSION = DESKTOP_PKG.build?.electronVersion
if (!ELECTRON_VERSION) {
  throw new Error('apps/desktop/package.json missing build.electronVersion')
}

const target = resolveRuntimeTarget()

function rm(dir) {
  fs.rmSync(dir, { recursive: true, force: true })
}

function cpDir(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  fs.cpSync(src, dest, { recursive: true })
}

function buildOpptrixPackageIndex() {
  /** @type {Map<string, string>} short npm name → packages/ folder */
  const index = new Map()
  const packagesDir = path.join(REPO_ROOT, 'packages')
  for (const dir of fs.readdirSync(packagesDir)) {
    const pkgJsonPath = path.join(packagesDir, dir, 'package.json')
    if (!fs.existsSync(pkgJsonPath)) continue
    const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'))
    const fullName = pkgJson.name
    if (typeof fullName !== 'string' || !fullName.startsWith('@opptrix/')) continue
    index.set(fullName.replace('@opptrix/', ''), dir)
  }
  return index
}

const OPPTX_PACKAGE_INDEX = buildOpptrixPackageIndex()

function collectOpptrixPackages() {
  const seen = new Set()
  const queue = []
  const serverPkg = JSON.parse(fs.readFileSync(SERVER_PKG_PATH, 'utf8'))

  for (const dep of Object.keys(serverPkg.dependencies ?? {})) {
    if (dep.startsWith('@opptrix/')) {
      queue.push(dep.replace('@opptrix/', ''))
    }
  }

  while (queue.length > 0) {
    const pkg = queue.shift()
    if (seen.has(pkg)) continue
    seen.add(pkg)

    const folder = OPPTX_PACKAGE_INDEX.get(pkg)
    if (!folder) {
      throw new Error(`Workspace package not found for desktop runtime: @opptrix/${pkg}`)
    }

    const pkgJsonPath = path.join(REPO_ROOT, 'packages', folder, 'package.json')
    const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'))
    for (const dep of Object.keys(pkgJson.dependencies ?? {})) {
      if (dep.startsWith('@opptrix/')) {
        queue.push(dep.replace('@opptrix/', ''))
      }
    }
  }

  return [...seen].sort()
}

function collectServerNpmDeps() {
  const serverPkg = JSON.parse(fs.readFileSync(SERVER_PKG_PATH, 'utf8'))
  const deps = {}
  for (const [name, version] of Object.entries(serverPkg.dependencies ?? {})) {
    if (!name.startsWith('@opptrix/')) deps[name] = version
  }
  return deps
}

function ffmpegBinaryPath(dir, platform) {
  return platform === 'win32'
    ? path.join(dir, 'ffmpeg.exe')
    : path.join(dir, 'ffmpeg')
}

function downloadFile(url, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  const script = [
    `import fs from 'node:fs'`,
    `const resp = await fetch(${JSON.stringify(url)})`,
    `if (!resp.ok) { console.error('HTTP', resp.status, ${JSON.stringify(url)}); process.exit(1) }`,
    `fs.writeFileSync(${JSON.stringify(dest)}, Buffer.from(await resp.arrayBuffer()))`,
  ].join('\n')
  const dl = spawnSync(process.execPath, ['--input-type=module', '-e', script], { stdio: 'inherit' })
  if (dl.status !== 0) {
    throw new Error(`Download failed (${dl.status}): ${url}`)
  }
}

function extractTarGz(archive, dest) {
  fs.mkdirSync(dest, { recursive: true })
  const absArchive = path.resolve(archive)
  const absDest = path.resolve(dest)

  // Prefer Windows system bsdtar — Git/MSYS tar treats `D:\...` as `host:path`
  // (`Cannot connect to D:`) and fails on Actions runners.
  let tarBin = 'tar'
  if (process.platform === 'win32') {
    const systemTar = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe')
    if (fs.existsSync(systemTar)) tarBin = systemTar
  }

  if (process.platform === 'win32') {
    const archiveDir = path.dirname(absArchive)
    const archiveBase = path.basename(absArchive)
    let destArg = path.relative(archiveDir, absDest)
    if (!destArg) destArg = '.'
    const tar = spawnSync(tarBin, ['-xzf', archiveBase, '-C', destArg], {
      cwd: archiveDir,
      stdio: 'inherit',
      windowsHide: true,
    })
    if (tar.status === 0) return
    // Fallback: absolute paths with forward slashes (some tar builds accept this)
    const fwdArchive = absArchive.replace(/\\/g, '/')
    const fwdDest = absDest.replace(/\\/g, '/')
    const retry = spawnSync(tarBin, ['-xzf', fwdArchive, '-C', fwdDest], {
      stdio: 'inherit',
      windowsHide: true,
    })
    if (retry.status !== 0) {
      throw new Error(`Extract failed (${retry.status ?? tar.status}): ${archive}`)
    }
    return
  }

  const tar = spawnSync(tarBin, ['-xzf', absArchive, '-C', absDest], { stdio: 'inherit' })
  if (tar.status !== 0) {
    throw new Error(`Extract failed (${tar.status}): ${archive}`)
  }
}

function betterSqlite3ReleaseNode() {
  return path.join(STAGE, 'node_modules/better-sqlite3/build/Release/better_sqlite3.node')
}

function ensureBetterSqlite3Prebuild() {
  const releaseNode = betterSqlite3ReleaseNode()
  if (fs.existsSync(releaseNode)) return true

  const sqliteDir = path.join(STAGE, 'node_modules/better-sqlite3')
  const pkgJsonPath = path.join(sqliteDir, 'package.json')
  if (!fs.existsSync(pkgJsonPath)) {
    console.warn('better-sqlite3 not installed in runtime-stage')
    return false
  }

  const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'))
  const version = pkgJson.version
  const abi = nodeAbi.getAbi(ELECTRON_VERSION, 'electron')
  const asset = `better-sqlite3-v${version}-electron-v${abi}-${target.platform}-${target.arch}.tar.gz`
  const mirrorBase = (
    process.env.OPPTRIX_PREBUILD_MIRROR?.trim()
    || 'https://cdn.npmmirror.com/binaries/better-sqlite3'
  ).replace(/\/$/, '')
  const cacheDir = PREBUILD_CACHE
  const archive = path.join(cacheDir, asset)

  console.log(`Fetching better-sqlite3 prebuild (${target.platform}-${target.arch}, electron ${ELECTRON_VERSION})…`)
  const urls = [
    `${mirrorBase}/v${version}/${asset}`,
    `https://github.com/WiseLibs/better-sqlite3/releases/download/v${version}/${asset}`,
  ]
  let fetched = false
  for (const url of urls) {
    try {
      if (!fs.existsSync(archive)) downloadFile(url, archive)
      extractTarGz(archive, sqliteDir)
      fetched = true
      break
    } catch (err) {
      try { fs.unlinkSync(archive) } catch { /* ignore */ }
      console.warn(`Prebuild fetch failed (${url}): ${err instanceof Error ? err.message : err}`)
    }
  }
  if (!fetched) {
    console.log('Trying prebuild-install…')
    const install = runNpm(
      ['exec', '--', 'prebuild-install', '-r', 'electron', '-t', ELECTRON_VERSION],
      {
        cwd: sqliteDir,
        target,
        extraEnv: electronRebuildEnv(ELECTRON_VERSION, target),
      },
    )
    if (install.status !== 0) return false
  }

  if (!fs.existsSync(releaseNode)) {
    console.error('better-sqlite3 prebuild install did not produce better_sqlite3.node')
    return false
  }
  return true
}

function ensureFfmpegStatic() {
  const stageDir = path.join(STAGE, 'node_modules/ffmpeg-static')
  const stageBinary = ffmpegBinaryPath(stageDir, target.platform)
  if (fs.existsSync(stageBinary)) return

  const installJs = path.join(stageDir, 'install.js')
  if (!fs.existsSync(installJs)) {
    console.warn('ffmpeg-static not installed in runtime-stage')
    return
  }

  if (hostMatchesTarget(target)) {
    const rootFfmpeg = path.join(REPO_ROOT, 'node_modules/ffmpeg-static')
    const rootBinary = ffmpegBinaryPath(rootFfmpeg, target.platform)
    if (fs.existsSync(rootBinary)) {
      console.log('Seeding ffmpeg-static from workspace (matching host arch)…')
      fs.cpSync(rootFfmpeg, stageDir, { recursive: true, force: true })
      if (fs.existsSync(stageBinary)) return
    }
  }

  console.log(`Downloading ffmpeg-static for ${target.platform}-${target.arch}…`)
  const dl = runNodeScript(installJs, { cwd: stageDir, target })
  if (dl.status !== 0) {
    console.error('ffmpeg-static install failed — sidecar audio/video features may be unavailable')
  }
}

function duckdbBindingNode() {
  return path.join(STAGE, 'node_modules/duckdb/lib/binding/duckdb.node')
}

/**
 * duckdb publishes Node ABI binaries only (not Electron). The addon is N-API, so a
 * Node prebuild loads under ELECTRON_RUN_AS_NODE. Avoid rebuilding for Electron —
 * that 404s the prebuild and falls back to a multi-hour MSVC/clang compile that often fails.
 */
function ensureDuckdbPrebuild() {
  const duckdbNode = duckdbBindingNode()
  if (fs.existsSync(duckdbNode)) return true

  const duckdbDir = path.join(STAGE, 'node_modules/duckdb')
  const pkgJsonPath = path.join(duckdbDir, 'package.json')
  if (!fs.existsSync(pkgJsonPath)) {
    console.warn('duckdb not installed in runtime-stage')
    return false
  }

  const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'))
  const version = pkgJson.version
  const abi = process.versions.modules
  const asset = `duckdb-v${version}-node-v${abi}-${target.platform}-${target.arch}.tar.gz`
  const host = String(pkgJson.binary?.host || 'https://npm.duckdb.org/duckdb').replace(/\/$/, '')
  const url = `${host}/${asset}`
  const cacheDir = PREBUILD_CACHE
  const archive = path.join(cacheDir, asset)
  // Tarball contains binding/duckdb.node → extract into lib/ → lib/binding/duckdb.node
  const extractRoot = path.join(duckdbDir, 'lib')

  console.log(
    `Fetching duckdb Node prebuild (${target.platform}-${target.arch}, node-v${abi}; N-API for ELECTRON_RUN_AS_NODE)…`,
  )
  try {
    if (!fs.existsSync(archive)) downloadFile(url, archive)
    extractTarGz(archive, extractRoot)
  } catch (err) {
    console.warn(`DuckDB prebuild download failed: ${err instanceof Error ? err.message : err}`)
    console.log('Trying node-pre-gyp with Node runtime (not Electron)…')
    const install = runNpm(
      ['exec', '--', 'node-pre-gyp', 'install'],
      {
        cwd: duckdbDir,
        target,
        extraEnv: nodeNativeEnv(target),
      },
    )
    if (install.status !== 0) return false
  }

  if (!fs.existsSync(duckdbNode)) {
    console.error('duckdb prebuild install did not produce duckdb.node')
    return false
  }
  return true
}

/**
 * @duckdb/node-api loads platform optionalDependencies (@duckdb/node-bindings-{platform}-{arch}).
 * Cross-builds (arm64 host → darwin-x64) hit EBADPLATFORM on `npm install`, so fetch the
 * registry tarball instead of relying on optional-dep install against the host CPU.
 */
function duckdbNeoBindingsPackageName() {
  return `@duckdb/node-bindings-${target.platform}-${target.arch}`
}

function duckdbNeoBindingsNode() {
  const pkgName = duckdbNeoBindingsPackageName()
  return path.join(STAGE, 'node_modules', ...pkgName.split('/'), 'duckdb.node')
}

function npmRegistryBase() {
  return (
    process.env.npm_config_registry?.trim()
    || process.env.NPM_CONFIG_REGISTRY?.trim()
    || 'https://registry.npmjs.org'
  ).replace(/\/$/, '')
}

function installScopedPackageFromRegistry(pkgName, version) {
  const shortName = pkgName.includes('/') ? pkgName.split('/').pop() : pkgName
  const url = `${npmRegistryBase()}/${pkgName}/-/${shortName}-${version}.tgz`
  const cacheDir = PREBUILD_CACHE
  const archive = path.join(cacheDir, `${shortName}-${version}.tgz`)
  const extractTmp = path.join(cacheDir, `${shortName}-${version}-extract`)
  const destDir = path.join(STAGE, 'node_modules', ...pkgName.split('/'))

  console.log(`Fetching ${pkgName}@${version} from registry (bypass host platform check)…`)
  if (!fs.existsSync(archive)) downloadFile(url, archive)

  rm(extractTmp)
  extractTarGz(archive, extractTmp)
  const pkgRoot = path.join(extractTmp, 'package')
  if (!fs.existsSync(pkgRoot)) {
    throw new Error(`npm pack layout unexpected for ${pkgName}: missing package/`)
  }

  fs.mkdirSync(path.dirname(destDir), { recursive: true })
  rm(destDir)
  fs.cpSync(pkgRoot, destDir, { recursive: true })
  rm(extractTmp)
}

function ensureDuckdbNeoBindings() {
  const neoNode = duckdbNeoBindingsNode()
  if (fs.existsSync(neoNode)) return true

  const metaPath = path.join(STAGE, 'node_modules/@duckdb/node-bindings/package.json')
  if (!fs.existsSync(metaPath)) {
    console.warn('@duckdb/node-bindings not installed in runtime-stage — skipping neo binding check')
    return true
  }

  const version = JSON.parse(fs.readFileSync(metaPath, 'utf8')).version
  const pkgName = duckdbNeoBindingsPackageName()
  try {
    installScopedPackageFromRegistry(pkgName, version)
  } catch (err) {
    console.warn(`Registry fetch failed: ${err instanceof Error ? err.message : err}`)
    console.log(`Trying npm install ${pkgName} with --os/--cpu --force…`)
    const install = runNpm(
      [
        'install',
        `${pkgName}@${version}`,
        ...npmTargetCliArgs(target),
        '--force',
        '--no-save',
        '--omit=dev',
        '--no-audit',
        '--no-fund',
        '--ignore-scripts',
      ],
      // Rosetta does not change Node's reported cpu for npm's EBADPLATFORM check.
      { cwd: STAGE, target, useRosetta: false },
    )
    if (install.status !== 0) return false
  }

  if (!fs.existsSync(neoNode)) {
    console.error(`missing ${neoNode} after installing ${pkgName}`)
    return false
  }
  return true
}

function ensurePlaywrightChromium() {
  const ensureScript = path.join(REPO_ROOT, 'packages/agent-browser/scripts/ensure-chromium.mjs')
  if (!fs.existsSync(ensureScript)) {
    throw new Error(`missing ${ensureScript}`)
  }

  fs.mkdirSync(PLAYWRIGHT_BROWSERS, { recursive: true })
  console.log(`Installing Playwright Chromium for desktop runtime (${target.platform}-${target.arch})…`)

  const install = spawnSync(
    process.execPath,
    [ensureScript, '--strict'],
    {
      cwd: STAGE,
      env: {
        ...process.env,
        PLAYWRIGHT_BROWSERS_PATH: PLAYWRIGHT_BROWSERS,
        NODE_PATH: STAGE_NM,
      },
      stdio: 'inherit',
    },
  )
  if (install.status !== 0) {
    console.error(
      `Playwright Chromium install failed — agent browser tools require Chromium`
      + ` at ${PLAYWRIGHT_BROWSERS}.`,
    )
    process.exit(install.status ?? 1)
  }

  // Same probe as runtime launch (`chromium.executablePath()`); empty dir must not pass.
  const prevBrowsers = process.env.PLAYWRIGHT_BROWSERS_PATH
  process.env.PLAYWRIGHT_BROWSERS_PATH = PLAYWRIGHT_BROWSERS
  try {
    const pwPkg = path.join(STAGE_NM, 'playwright-core/package.json')
    if (!fs.existsSync(pwPkg)) {
      console.error(`Playwright Chromium post-check failed — missing ${pwPkg}`)
      process.exit(1)
    }
    const { chromium } = createRequire(pwPkg)('.')
    const exe = chromium.executablePath()
    if (!exe || !fs.existsSync(exe)) {
      console.error(
        `Playwright Chromium executable missing after install under ${PLAYWRIGHT_BROWSERS}`
        + ` (resolved ${exe || 'n/a'}).`,
      )
      process.exit(1)
    }
    console.log(`Playwright Chromium ready: ${exe}`)
  } catch (err) {
    console.error(
      `Playwright Chromium post-check failed: ${err instanceof Error ? err.message : err}`,
    )
    process.exit(1)
  } finally {
    if (prevBrowsers == null) delete process.env.PLAYWRIGHT_BROWSERS_PATH
    else process.env.PLAYWRIGHT_BROWSERS_PATH = prevBrowsers
  }
}

rm(STAGE)
fs.mkdirSync(STAGE, { recursive: true })

cpDir(path.join(REPO_ROOT, 'apps/server/dist'), path.join(STAGE, 'apps/server/dist'))
cpDir(path.join(REPO_ROOT, 'client-ui/dist'), path.join(STAGE, 'client-ui/dist'))

// Server dist requires apps/desktop/electron/resolve-ports.cjs via relative path
// (../../desktop/electron/… from apps/server/dist). Pack that single file into stage.
{
  const resolvePortsSrc = path.join(DESKTOP_ROOT, 'electron/resolve-ports.cjs')
  const resolvePortsDest = path.join(STAGE, 'apps/desktop/electron/resolve-ports.cjs')
  if (!fs.existsSync(resolvePortsSrc)) {
    throw new Error(`missing ${resolvePortsSrc}`)
  }
  fs.mkdirSync(path.dirname(resolvePortsDest), { recursive: true })
  fs.copyFileSync(resolvePortsSrc, resolvePortsDest)
}

const workspacePackages = collectOpptrixPackages()
for (const pkg of workspacePackages) {
  const folder = OPPTX_PACKAGE_INDEX.get(pkg)
  const pkgRoot = path.join(REPO_ROOT, 'packages', folder)
  const destRoot = path.join(STAGE, 'packages', pkg)
  fs.mkdirSync(destRoot, { recursive: true })
  fs.copyFileSync(path.join(pkgRoot, 'package.json'), path.join(destRoot, 'package.json'))
  cpDir(path.join(pkgRoot, 'dist'), path.join(destRoot, 'dist'))
  const skillsAsset = path.join(pkgRoot, 'dist', 'chain-knowledge.json')
  if (fs.existsSync(skillsAsset)) {
    fs.copyFileSync(skillsAsset, path.join(destRoot, 'dist', 'chain-knowledge.json'))
  }
}

const deps = collectServerNpmDeps()
for (const pkg of workspacePackages) {
  deps[`@opptrix/${pkg}`] = `file:./packages/${pkg}`
}

fs.writeFileSync(path.join(STAGE, 'package.json'), JSON.stringify({
  name: 'opptrix-desktop-runtime',
  private: true,
  type: 'module',
  dependencies: deps,
}, null, 2))

console.log(`Installing runtime deps (${target.platform}-${target.arch})…`)
const install = runNpm(
  [
    'install',
    '--omit=dev',
    '--no-audit',
    '--no-fund',
    '--ignore-scripts',
    ...npmTargetCliArgs(target),
  ],
  // Prefer CLI --os/--cpu over Rosetta: arch -x86_64 npm still reports host cpu to npm 10+.
  { cwd: STAGE, target, useRosetta: false },
)
if (install.status !== 0) process.exit(install.status ?? 1)

ensurePlaywrightChromium()

ensureFfmpegStatic()

// Only better-sqlite3 needs an Electron-matched ABI. Do not `npm rebuild` duckdb for
// Electron — there is no prebuild and source compile is prohibitively slow / flaky on CI.
console.log(`Rebuilding better-sqlite3 for Electron ${ELECTRON_VERSION} (${target.platform}-${target.arch})…`)
const rebuild = runNpm(['rebuild', 'better-sqlite3'], {
  cwd: STAGE,
  target,
  extraEnv: electronRebuildEnv(ELECTRON_VERSION, target),
})
const rebuildFailed = rebuild.status !== 0

if (!ensureBetterSqlite3Prebuild()) {
  if (rebuildFailed) process.exit(rebuild.status ?? 1)
  process.exit(1)
}

if (!ensureDuckdbPrebuild()) {
  console.error(
    `missing ${duckdbBindingNode()} — duckdb needs its official Node prebuild`
    + ` (${target.platform}-${target.arch}, node-v${process.versions.modules}).`
    + ' Electron-tagged binaries are not published; source compile is not used for packaging.',
  )
  process.exit(1)
}

if (!ensureDuckdbNeoBindings()) {
  console.error(
    `missing ${duckdbNeoBindingsNode()} — required for @duckdb/node-api`
    + ` (${duckdbNeoBindingsPackageName()}). AppImage/deb/Win/Mac packaged sidecars all need this.`,
  )
  process.exit(1)
}

function assertSandboxRuntimeVendor(depsRoot) {
  const vendorRoot = path.join(depsRoot, '@anthropic-ai/sandbox-runtime/vendor')
  const seccomp = path.join(vendorRoot, 'seccomp')
  const srtWin = path.join(vendorRoot, 'srt-win')
  if (!fs.existsSync(seccomp)) {
    throw new Error(`missing sandbox-runtime vendor seccomp at ${seccomp}`)
  }
  for (const arch of ['x64', 'arm64']) {
    const exe = path.join(srtWin, arch, 'srt-win.exe')
    if (!fs.existsSync(exe)) {
      throw new Error(`missing sandbox-runtime vendor ${exe}`)
    }
  }
  console.log('sandbox-runtime vendor OK (srt-win + seccomp)')
}

function ensureLinuxSandboxBins() {
  if (target.platform !== 'linux') return

  const arch = target.arch === 'x64' ? 'x64' : target.arch === 'arm64' ? 'arm64' : target.arch
  const destDir = path.join(STAGE, 'sandbox-bins', arch)
  fs.mkdirSync(destDir, { recursive: true })

  const debArch = arch === 'arm64' ? 'arm64' : 'amd64'
  const ubuntuPool = debArch === 'arm64'
    ? 'http://ports.ubuntu.com/ubuntu-ports/pool/main'
    : 'http://archive.ubuntu.com/ubuntu/pool/main'

  /** Pinned Ubuntu 24.04 (noble) packages — reproducible AppImage vendor. */
  const SANDBOX_BIN_SOURCES = {
    bwrap: {
      debUrl: `${ubuntuPool}/b/bubblewrap/bubblewrap_0.9.0-1ubuntu0.1_${debArch}.deb`,
      innerPath: 'usr/bin/bwrap',
    },
    socat: {
      debUrl: `${ubuntuPool}/s/socat/socat_1.8.0.0-4build3_${debArch}.deb`,
      innerPath: 'usr/bin/socat',
    },
    rg: {
      version: '14.1.1',
      tarUrl: `https://github.com/BurntSushi/ripgrep/releases/download/14.1.1/ripgrep-14.1.1-${debArch === 'arm64' ? 'aarch64' : 'x86_64'}-unknown-linux-musl.tar.gz`,
      innerPath: `ripgrep-14.1.1-${debArch === 'arm64' ? 'aarch64' : 'x86_64'}-unknown-linux-musl/rg`,
    },
  }

  function extractDebBinary(debUrl, innerPath, destPath) {
    const cacheDir = path.join(DESKTOP_ROOT, '.cache/sandbox-bins')
    const debName = path.basename(new URL(debUrl).pathname)
    const debPath = path.join(cacheDir, debName)
    fs.mkdirSync(cacheDir, { recursive: true })
    if (!fs.existsSync(debPath)) downloadFile(debUrl, debPath)

    const workDir = fs.mkdtempSync(path.join(cacheDir, 'deb-'))
    try {
      const ar = spawnSync('ar', ['x', debPath], { cwd: workDir, encoding: 'utf8' })
      if (ar.status !== 0) throw new Error(`ar extract failed for ${debName}`)
      const dataTar = ['data.tar.xz', 'data.tar.zst', 'data.tar.gz'].find(name =>
        fs.existsSync(path.join(workDir, name)),
      )
      if (!dataTar) throw new Error(`missing data tarball in ${debName}`)
      const tarArgs = dataTar.endsWith('.xz')
        ? ['-xJf', dataTar]
        : dataTar.endsWith('.zst')
          ? ['--zstd', '-xf', dataTar]
          : ['-xzf', dataTar]
      const tar = spawnSync('tar', [...tarArgs, '-C', workDir, innerPath], {
        cwd: workDir,
        encoding: 'utf8',
      })
      if (tar.status !== 0) throw new Error(`tar extract failed for ${innerPath} in ${debName}`)
      const extracted = path.join(workDir, innerPath)
      if (!fs.existsSync(extracted)) throw new Error(`missing ${innerPath} in ${debName}`)
      fs.copyFileSync(extracted, destPath)
      fs.chmodSync(destPath, 0o755)
    } finally {
      fs.rmSync(workDir, { recursive: true, force: true })
    }
  }

  function extractRipgrepTar(tarUrl, innerPath, destPath) {
    const cacheDir = path.join(DESKTOP_ROOT, '.cache/sandbox-bins')
    const tarName = path.basename(new URL(tarUrl).pathname)
    const tarPath = path.join(cacheDir, tarName)
    fs.mkdirSync(cacheDir, { recursive: true })
    if (!fs.existsSync(tarPath)) downloadFile(tarUrl, tarPath)
    const workDir = fs.mkdtempSync(path.join(cacheDir, 'rg-'))
    try {
      extractTarGz(tarPath, workDir)
      const extracted = path.join(workDir, innerPath)
      if (!fs.existsSync(extracted)) throw new Error(`missing ${innerPath} in ${tarName}`)
      fs.copyFileSync(extracted, destPath)
      fs.chmodSync(destPath, 0o755)
    } finally {
      fs.rmSync(workDir, { recursive: true, force: true })
    }
  }

  function stageFromDownload(name, dest, fetchFn) {
    const outPath = path.join(destDir, dest)
    if (fs.existsSync(outPath)) return true
    try {
      fetchFn(outPath)
      console.log(`sandbox-bins: downloaded ${dest}`)
      return true
    } catch (err) {
      console.warn(
        `sandbox-bins: download ${name} failed — ${err instanceof Error ? err.message : err}`,
      )
      return false
    }
  }

  function stageFromHostWhich(name, dest) {
    if (!hostMatchesTarget(target)) return false
    const outPath = path.join(destDir, dest)
    if (fs.existsSync(outPath)) return true
    const which = spawnSync('which', [name], { encoding: 'utf8' })
    if (which.status !== 0 || !which.stdout.trim()) return false
    fs.copyFileSync(which.stdout.trim(), outPath)
    fs.chmodSync(outPath, 0o755)
    console.log(`sandbox-bins: staged ${dest} from host`)
    return true
  }

  const bins = [
    {
      name: 'bwrap',
      dest: 'bwrap',
      download: out => extractDebBinary(SANDBOX_BIN_SOURCES.bwrap.debUrl, SANDBOX_BIN_SOURCES.bwrap.innerPath, out),
    },
    {
      name: 'socat',
      dest: 'socat',
      download: out => extractDebBinary(SANDBOX_BIN_SOURCES.socat.debUrl, SANDBOX_BIN_SOURCES.socat.innerPath, out),
    },
    {
      name: 'rg',
      dest: 'rg',
      download: out => extractRipgrepTar(SANDBOX_BIN_SOURCES.rg.tarUrl, SANDBOX_BIN_SOURCES.rg.innerPath, out),
    },
  ]

  const missing = []
  for (const { name, dest, download } of bins) {
    const outPath = path.join(destDir, dest)
    if (fs.existsSync(outPath)) continue
    if (stageFromDownload(name, dest, download)) continue
    if (stageFromHostWhich(name, dest)) continue
    missing.push(name)
    console.warn(`sandbox-bins: ${name} unavailable — AppImage may need system packages or deb install`)
  }

  if (missing.length) {
    console.warn(
      `sandbox-bins incomplete (${missing.join(', ')}) for ${target.platform}-${target.arch}`
      + ' — deb package remains the most reliable Linux install path',
    )
  }
}

assertSandboxRuntimeVendor(STAGE_NM)
ensureLinuxSandboxBins()

if (rebuildFailed) {
  console.warn('better-sqlite3 rebuild reported errors but required native bindings are ready — continuing')
}

// Belt-and-suspenders: never ship download caches (notarization scans nested archives).
rm(path.join(STAGE, '.cache'))

// electron-builder skips a top-level directory named exactly `node_modules` when
// copying extraResources (createFilter). Rename so sidecar deps actually ship.
if (!fs.existsSync(STAGE_NM)) {
  throw new Error(`missing ${STAGE_NM} after install/rebuild`)
}
rm(STAGE_DEPS)
fs.renameSync(STAGE_NM, STAGE_DEPS)
if (!fs.existsSync(path.join(STAGE_DEPS, 'fastify'))) {
  throw new Error(`missing ${path.join(STAGE_DEPS, 'fastify')} after rename — sidecar deps incomplete`)
}
console.log(`Sidecar deps renamed node_modules → ${RUNTIME_DEPS_DIR}/ (electron-builder safe)`)

console.log(`Runtime staged at ${STAGE} [${target.platform}-${target.arch}]`)
