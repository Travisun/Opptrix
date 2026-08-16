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
// Shared models (SenseVoice / e5 / RapidOCR): skip when CI already restored
// them from the stage-shared-models artifact (OPPTRIX_SKIP_SHARED_MODEL_STAGE=1).
if (process.env.OPPTRIX_SKIP_SHARED_MODEL_STAGE !== '1') {
  run('node', ['scripts/stage-sensevoice.mjs'], DESKTOP_ROOT)
  run('node', ['scripts/stage-e5.mjs'], DESKTOP_ROOT)
  run('node', ['scripts/stage-rapidocr.mjs'], DESKTOP_ROOT)
} else {
  console.log('prebuild: skip shared model stage (artifact restore)')
}
run('node', ['scripts/stage-rag-engines.mjs'], DESKTOP_ROOT)
// Bundled managed Python (after build:packages above). CI/release also stage before audit.
run('node', ['scripts/stage-python.mjs'], DESKTOP_ROOT)
process.env.OPPTRIX_AUDIT_REQUIRE_STAGED_PYTHON = '1'
process.env.OPPTRIX_AUDIT_STAGE_UPDATER = '1'
run('node', ['scripts/audit-desktop-pack.mjs'], DESKTOP_ROOT)
run('node', ['scripts/stage-runtime.mjs'], DESKTOP_ROOT)
run('node', ['scripts/verify-runtime.mjs'], DESKTOP_ROOT)

console.log('Desktop build inputs ready.')
