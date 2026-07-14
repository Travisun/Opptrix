#!/usr/bin/env node
/**
 * Fail CI if electron-builder omitted sidecar deps under runtime-stage.
 *
 * Root cause this guards: app-builder-lib createFilter skips a directory whose
 * relative path is exactly `node_modules`, so staged deps must ship as `deps/`.
 */
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(path.join(__dirname, '../package.json'))
const { RUNTIME_DEPS_DIR } = require('./electron/runtime-deps.cjs')

function fail(msg) {
  console.error(`verify-packaged-runtime: ${msg}`)
  process.exit(1)
}

function findRuntimeStages(releaseDir) {
  const found = []
  const stack = [releaseDir]
  while (stack.length > 0) {
    const dir = stack.pop()
    let entries
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const full = path.join(dir, entry.name)
      if (entry.name === 'runtime-stage') {
        found.push(full)
      } else if (entry.name === 'node_modules' || entry.name === '.git') {
        continue
      } else {
        stack.push(full)
      }
    }
  }
  return found
}

function assertStage(stageDir) {
  const depsFastify = path.join(stageDir, RUNTIME_DEPS_DIR, 'fastify')
  const legacyNm = path.join(stageDir, 'node_modules')
  if (!fs.existsSync(depsFastify)) {
    const hint = fs.existsSync(legacyNm)
      ? `found legacy ${legacyNm} instead — electron-builder dropped top-level node_modules; stage must rename to ${RUNTIME_DEPS_DIR}/`
      : `missing ${depsFastify}`
    fail(hint)
  }
  if (fs.existsSync(legacyNm)) {
    fail(
      `${legacyNm} must not ship (electron-builder skips top-level node_modules). `
        + `Expected only ${path.join(stageDir, RUNTIME_DEPS_DIR)}`,
    )
  }
  console.log(`verify-packaged-runtime: OK ${depsFastify}`)
}

const releaseDir = path.resolve(process.argv[2] || path.join(__dirname, '../release'))
if (!fs.existsSync(releaseDir)) {
  fail(`release dir not found: ${releaseDir}`)
}

const stages = findRuntimeStages(releaseDir)
if (stages.length === 0) {
  fail(`no runtime-stage under ${releaseDir} — build may have failed before extraResources`)
}

for (const stage of stages) {
  assertStage(stage)
}

console.log(`verify-packaged-runtime: ${stages.length} runtime-stage tree(s) OK`)
