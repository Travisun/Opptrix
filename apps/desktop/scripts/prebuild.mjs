#!/usr/bin/env node
/** Build client + server before Electron production bundle. */
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { REPO_ROOT } from './lib/paths.mjs'

const DESKTOP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function run(cmd, args, cwd = REPO_ROOT) {
  const r = spawnSync(cmd, args, { cwd, stdio: 'inherit', shell: true })
  if (r.status !== 0) process.exit(r.status ?? 1)
}

run('npm', ['run', 'build:packages'])
run('npm', ['run', 'build', '-w', 'opptrix-client'])
run('node', ['scripts/prepare-icons.mjs'], DESKTOP_ROOT)
run('node', ['scripts/stage-updater-deps.mjs'], DESKTOP_ROOT)
run('node', ['scripts/stage-runtime.mjs'], DESKTOP_ROOT)
run('node', ['scripts/verify-runtime.mjs'], DESKTOP_ROOT)

console.log('Desktop build inputs ready.')
