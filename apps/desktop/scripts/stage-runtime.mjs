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

const WORKSPACE_PACKAGES = [
  'shared',
  'a-stock-layer',
  'stock-eval',
  'institutions',
  't-strategy',
  'skills',
  'stock-writer',
  'research-hub',
  'agent',
]

function rm(dir) {
  fs.rmSync(dir, { recursive: true, force: true })
}

function cpDir(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  fs.cpSync(src, dest, { recursive: true })
}

rm(STAGE)
fs.mkdirSync(STAGE, { recursive: true })

// Server + UI assets
cpDir(path.join(REPO_ROOT, 'apps/server/dist'), path.join(STAGE, 'apps/server/dist'))
cpDir(path.join(REPO_ROOT, 'client-ui/dist'), path.join(STAGE, 'client-ui/dist'))

for (const pkg of WORKSPACE_PACKAGES) {
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

const deps = {
  fastify: '^5.2.0',
  '@fastify/static': '^8.0.4',
}
for (const pkg of WORKSPACE_PACKAGES) {
  deps[`@inno-a-stock/${pkg}`] = `file:./packages/${pkg}`
}

const pkgJson = {
  name: 'inno-a-stock-desktop-runtime',
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
