#!/usr/bin/env node
/**
 * Fail CI if electron-builder omitted sidecar deps under runtime-stage,
 * or afterPack failed to restore deps → node_modules for ESM resolution.
 *
 * Staging: ship as `deps/` (createFilter skips exact relative `node_modules`).
 * afterPack: rename to `node_modules` so packaged ESM can `import 'fastify'`.
 * NODE_PATH alone is NOT enough for Node ESM bare specifiers.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { assertPlaywrightChromiumExecutable } from './lib/assert-playwright-chromium.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

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
  const nmFastify = path.join(stageDir, 'node_modules', 'fastify')
  const depsFastify = path.join(stageDir, 'deps', 'fastify')
  if (fs.existsSync(depsFastify) && !fs.existsSync(nmFastify)) {
    fail(
      `${path.join(stageDir, 'deps')} still present without node_modules — `
        + 'afterPack must rename deps → node_modules for ESM imports',
    )
  }
  if (!fs.existsSync(nmFastify)) {
    fail(`missing ${nmFastify} (sidecar cannot start without Fastify)`)
  }
  if (fs.existsSync(path.join(stageDir, 'deps'))) {
    fail(`${path.join(stageDir, 'deps')} must be renamed to node_modules after pack`)
  }
  const playwrightBrowsers = path.join(stageDir, 'playwright-browsers')
  const chromiumExe = assertPlaywrightChromiumExecutable(
    playwrightBrowsers,
    // Prefer restored node_modules; deps/ should already be renamed after pack.
    [path.join(stageDir, 'node_modules'), path.join(stageDir, 'deps')],
    fail,
  )
  console.log(`verify-packaged-runtime: OK ${nmFastify}`)
  console.log(`verify-packaged-runtime: OK Chromium ${chromiumExe}`)
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
