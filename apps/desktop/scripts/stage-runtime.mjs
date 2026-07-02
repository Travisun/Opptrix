#!/usr/bin/env node
/**
 * Stage a self-contained Node runtime for the desktop sidecar (production bundle).
 * Native modules are rebuilt for Electron's embedded Node (ELECTRON_RUN_AS_NODE sidecar).
 */
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import {
  electronRebuildEnv,
  hostMatchesTarget,
  resolveRuntimeTarget,
  runNodeScript,
  runNpm,
} from './lib/runtime-target.mjs'

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

    const pkgJsonPath = path.join(REPO_ROOT, 'packages', pkg, 'package.json')
    if (!fs.existsSync(pkgJsonPath)) {
      throw new Error(`Workspace package not found for desktop runtime: @opptrix/${pkg}`)
    }

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

function ensureFfmpegStatic() {
  const stageDir = path.join(STAGE, 'node_modules/ffmpeg-static')
  const stageBinary = path.join(stageDir, 'ffmpeg')
  if (fs.existsSync(stageBinary)) return

  const installJs = path.join(stageDir, 'install.js')
  if (!fs.existsSync(installJs)) {
    console.warn('ffmpeg-static not installed in runtime-stage')
    return
  }

  if (hostMatchesTarget(target)) {
    const rootFfmpeg = path.join(REPO_ROOT, 'node_modules/ffmpeg-static')
    const rootBinary = path.join(rootFfmpeg, 'ffmpeg')
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
  const pkgRoot = path.join(REPO_ROOT, 'packages', pkg)
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
if (rebuild.status !== 0) process.exit(rebuild.status ?? 1)

console.log(`Runtime staged at ${STAGE} [${target.platform}-${target.arch}]`)
