#!/usr/bin/env node
/**
 * Native binding self-heal (predev / pretest guard).
 *
 * Native modules (better-sqlite3, onnxruntime-node) are compiled per Node ABI
 * (NODE_MODULE_VERSION). Switching Node versions (nvm/homebrew) invalidates
 * them with ERR_DLOPEN_FAILED. This guard detects the mismatch using the
 * CURRENT node and rebuilds — so `npm run dev` / `npm test` self-heal no
 * matter which Node flavor starts them.
 *
 * Fast path: loading better-sqlite3 takes ~10ms when healthy.
 */

import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)))

function tryLoad(moduleName) {
  // Fresh process: a failed dlopen would poison this one. CJS require resolves
  // node_modules from cwd (ROOT), matching how the server loads it.
  const r = spawnSync(
    process.execPath,
    ['--eval', `require(${JSON.stringify(moduleName)})( ':memory:' )`],
    { cwd: ROOT, encoding: 'utf8', timeout: 30_000 },
  )
  return r.status === 0
}

function npmRebuild(packages) {
  console.log(`[native-bindings] rebuilding ${packages.join(', ')} for ${process.version} …`)
  const binDir = path.dirname(process.execPath)
  const candidates = [
    // nvm / version-manager layout
    path.join(binDir, '..', 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js'),
    // homebrew / shared prefix layout
    path.join(binDir, 'node_modules', 'npm', 'bin', 'npm-cli.js'),
  ]
  for (const cli of candidates) {
    if (!fs.existsSync(cli)) continue
    const r = spawnSync(process.execPath, [cli, 'rebuild', ...packages, '--foreground-scripts'], {
      cwd: ROOT,
      stdio: 'inherit',
      timeout: 600_000,
    })
    if (r.status === 0) return true
    return false
  }
  // Final fallback: npm from PATH.
  const r = spawnSync('npm', ['rebuild', ...packages, '--foreground-scripts'], {
    cwd: ROOT,
    stdio: 'inherit',
    shell: true,
    timeout: 600_000,
  })
  return r.status === 0
}

const REQUIRED = ['better-sqlite3']
const broken = REQUIRED.filter((m) => !tryLoad(m))

if (broken.length === 0) {
  process.exit(0)
}

console.log(`[native-bindings] ABI mismatch detected for: ${broken.join(', ')} (node ${process.version})`)
if (!npmRebuild(broken)) {
  console.error('[native-bindings] rebuild failed — run manually: npm rebuild better-sqlite3')
  process.exit(1)
}

if (!broken.every((m) => tryLoad(m))) {
  console.error('[native-bindings] rebuild completed but load still fails')
  process.exit(1)
}
console.log('[native-bindings] healed ✓')
