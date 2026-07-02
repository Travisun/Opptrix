#!/usr/bin/env node
/**
 * Stage a self-contained Node runtime for the desktop sidecar (production bundle).
 */
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '../../..')
const STAGE = path.join(REPO_ROOT, 'apps/desktop/runtime-stage')
const SERVER_PKG_PATH = path.join(REPO_ROOT, 'apps/server/package.json')

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

const pkgJson = {
  name: 'opptrix-desktop-runtime',
  private: true,
  type: 'module',
  dependencies: deps,
}

fs.writeFileSync(path.join(STAGE, 'package.json'), JSON.stringify(pkgJson, null, 2))

console.log('Installing desktop runtime dependencies…')
const install = spawnSync('npm', ['install', '--omit=dev', '--no-audit', '--no-fund'], {
  cwd: STAGE,
  stdio: 'inherit',
  shell: true,
})
if (install.status !== 0) process.exit(install.status ?? 1)

console.log(`Runtime staged at ${STAGE}`)
