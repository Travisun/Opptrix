#!/usr/bin/env node
/**
 * Stage a self-contained Node runtime for the desktop sidecar (production bundle).
 * Native modules are rebuilt for Electron's embedded Node (ELECTRON_RUN_AS_NODE sidecar).
 */
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import {
  electronRebuildEnv,
  hostMatchesTarget,
  resolveRuntimeTarget,
  runNodeScript,
  runNpm,
} from './lib/runtime-target.mjs'

const require = createRequire(import.meta.url)
const nodeAbi = require('node-abi')

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '../../..')
const DESKTOP_ROOT = path.join(REPO_ROOT, 'apps/desktop')
const STAGE = path.join(DESKTOP_ROOT, 'runtime-stage')
const SERVER_PKG_PATH = path.join(REPO_ROOT, 'apps/server/package.json')

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
  const tarArgs = ['-xzf', archive, '-C', dest]
  const tar = spawnSync('tar', tarArgs, { stdio: 'inherit' })
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
  const url = `${mirrorBase}/v${version}/${asset}`
  const cacheDir = path.join(STAGE, '.cache/prebuilds')
  const archive = path.join(cacheDir, asset)

  console.log(`Fetching better-sqlite3 prebuild (${target.platform}-${target.arch}, electron ${ELECTRON_VERSION})…`)
  try {
    if (!fs.existsSync(archive)) downloadFile(url, archive)
    extractTarGz(archive, sqliteDir)
  } catch (err) {
    console.warn(`Prebuild mirror failed: ${err instanceof Error ? err.message : err}`)
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

rm(STAGE)
fs.mkdirSync(STAGE, { recursive: true })

cpDir(path.join(REPO_ROOT, 'apps/server/dist'), path.join(STAGE, 'apps/server/dist'))
cpDir(path.join(REPO_ROOT, 'client-ui/dist'), path.join(STAGE, 'client-ui/dist'))

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
  ['install', '--omit=dev', '--no-audit', '--no-fund', '--ignore-scripts'],
  { cwd: STAGE, target },
)
if (install.status !== 0) process.exit(install.status ?? 1)

ensureFfmpegStatic()

console.log(`Rebuilding native modules for Electron ${ELECTRON_VERSION} (${target.platform}-${target.arch})…`)
const rebuild = runNpm(['rebuild'], {
  cwd: STAGE,
  target,
  extraEnv: electronRebuildEnv(ELECTRON_VERSION, target),
})
const rebuildFailed = rebuild.status !== 0

if (!ensureBetterSqlite3Prebuild()) {
  if (rebuildFailed) process.exit(rebuild.status ?? 1)
  process.exit(1)
}

if (rebuildFailed) {
  console.warn('npm rebuild reported errors but better-sqlite3 prebuild is ready — continuing')
}

console.log(`Runtime staged at ${STAGE} [${target.platform}-${target.arch}]`)
