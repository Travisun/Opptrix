#!/usr/bin/env node
/** Smoke-test staged sidecar: native modules load + /api/health responds. */
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { assertPlaywrightChromiumExecutable } from './lib/assert-playwright-chromium.mjs'
import { hostMatchesTarget, resolveRuntimeTarget } from './lib/runtime-target.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DESKTOP_ROOT = path.resolve(__dirname, '..')
const REPO_ROOT = path.resolve(DESKTOP_ROOT, '../..')
const STAGE = path.join(DESKTOP_ROOT, 'runtime-stage')
const PORT = process.env.STOCK_RESEARCH_PORT ?? '18711'

const require = createRequire(path.join(DESKTOP_ROOT, 'package.json'))
const { RUNTIME_DEPS_DIR } = require('./electron/runtime-deps.cjs')

function fail(msg) {
  console.error(`verify-runtime: ${msg}`)
  process.exit(1)
}

const target = resolveRuntimeTarget()

const entry = path.join(STAGE, 'apps/server/dist/index.js')
if (!fs.existsSync(entry)) {
  fail(`missing server entry ${entry} — run prebuild first`)
}

function resolveDepsRoot() {
  const deps = path.join(STAGE, RUNTIME_DEPS_DIR)
  if (fs.existsSync(deps)) return deps
  const legacy = path.join(STAGE, 'node_modules')
  if (fs.existsSync(legacy)) return legacy
  fail(`missing ${deps} (and legacy node_modules) — run stage-runtime.mjs`)
}

const depsRoot = resolveDepsRoot()

/**
 * Node resolves node_modules by walking parents of the entry script. After we
 * rename STAGE/node_modules → deps/ (electron-builder safe), that walk skips
 * sidecar natives and can hit the monorepo's better-sqlite3 (wrong ABI) when
 * verifying inside the checkout. Symlink restores classic resolution only under
 * STAGE; electron-builder still skips a top-level `node_modules` copy target.
 */
function ensureStageNodeModulesLink() {
  const nm = path.join(STAGE, 'node_modules')
  if (fs.existsSync(nm)) return
  const target = path.join(STAGE, RUNTIME_DEPS_DIR)
  if (!fs.existsSync(target)) fail(`missing ${target} for node_modules link`)
  try {
    if (process.platform === 'win32') {
      fs.symlinkSync(target, nm, 'junction')
    } else {
      fs.symlinkSync(RUNTIME_DEPS_DIR, nm, 'dir')
    }
  } catch (err) {
    fail(`cannot link ${nm} → ${RUNTIME_DEPS_DIR}: ${err instanceof Error ? err.message : err}`)
  }
}

ensureStageNodeModulesLink()

function resolveElectronBinary() {
  if (process.env.OPPTRIX_ELECTRON_BINARY?.trim()) {
    return process.env.OPPTRIX_ELECTRON_BINARY.trim()
  }
  try {
    return require('electron')
  } catch { /* fall through */ }

  const packagedCandidates = [
    path.join(DESKTOP_ROOT, 'release/mac-arm64/Opptrix.app/Contents/MacOS/Opptrix'),
    path.join(DESKTOP_ROOT, 'release/mac/Opptrix.app/Contents/MacOS/Opptrix'),
    path.join(DESKTOP_ROOT, 'release/mac-x64/Opptrix.app/Contents/MacOS/Opptrix'),
    path.join(DESKTOP_ROOT, 'release/win-unpacked/Opptrix.exe'),
    path.join(DESKTOP_ROOT, 'release/linux-unpacked/opptrix'),
    path.join(DESKTOP_ROOT, 'release/linux-unpacked/Opptrix'),
  ]
  for (const candidate of packagedCandidates) {
    if (fs.existsSync(candidate)) return candidate
  }

  fail('electron not available — run npm install -w @opptrix/desktop, or set OPPTRIX_ELECTRON_BINARY')
}

const electronBin = resolveElectronBinary()

const sqliteNode = path.join(depsRoot, 'better-sqlite3/build/Release/better_sqlite3.node')
if (!fs.existsSync(sqliteNode)) {
  fail(`missing ${sqliteNode} — run stage-runtime.mjs`)
}

const duckdbNode = path.join(depsRoot, 'duckdb/lib/binding/duckdb.node')
if (!fs.existsSync(duckdbNode)) {
  fail(`missing ${duckdbNode} — run stage-runtime.mjs`)
}

const duckdbNeoPkg = `@duckdb/node-bindings-${target.platform}-${target.arch}`
const duckdbNeoNode = path.join(depsRoot, ...duckdbNeoPkg.split('/'), 'duckdb.node')
const duckdbNeoMeta = path.join(depsRoot, '@duckdb/node-bindings/package.json')
if (fs.existsSync(duckdbNeoMeta) && !fs.existsSync(duckdbNeoNode)) {
  fail(`missing ${duckdbNeoNode} — run stage-runtime.mjs (${duckdbNeoPkg})`)
}

if (!fs.existsSync(path.join(depsRoot, 'fastify'))) {
  fail(`missing ${path.join(depsRoot, 'fastify')} — sidecar cannot start without Fastify`)
}

const playwrightBrowsers = path.join(STAGE, 'playwright-browsers')
const chromiumExe = assertPlaywrightChromiumExecutable(
  playwrightBrowsers,
  [depsRoot, path.join(STAGE, 'node_modules')],
  fail,
)
console.log(`verify-runtime: OK Chromium ${chromiumExe}`)

if (!hostMatchesTarget(target)) {
  console.log(
    `verify-runtime: skip live sidecar (host ${process.platform}-${process.arch}`
    + ` != staged ${target.platform}-${target.arch}) — artifacts OK`,
  )
  process.exit(0)
}

async function waitForHealth(timeoutMs = 45_000) {
  const url = `http://127.0.0.1:${PORT}/api/health`
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    try {
      const resp = await fetch(url)
      if (resp.ok) return resp.json()
    } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 300))
  }
  fail(`API not ready at ${url}`)
}

console.log(`verify-runtime: starting sidecar on port ${PORT}…`)

  const child = spawn(electronBin, [entry], {
    cwd: STAGE,
    env: {
      ...process.env,
      SERVE_UI: '1',
      OPPTRIX_DESKTOP: '1',
      STOCK_RESEARCH_HOST: '127.0.0.1',
      STOCK_RESEARCH_PORT: PORT,
      UI_DIST_PATH: path.join(STAGE, 'client-ui/dist'),
      ELECTRON_RUN_AS_NODE: '1',
      PLAYWRIGHT_BROWSERS_PATH: playwrightBrowsers,
      // Prefer staged deps; STAGE/node_modules symlink handles parent-walk resolution.
      NODE_PATH: [depsRoot, path.join(STAGE, 'node_modules')].filter((p, i, a) => a.indexOf(p) === i).join(path.delimiter),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

let stderr = ''
child.stderr?.on('data', (chunk) => {
  const text = chunk.toString()
  stderr += text
  process.stderr.write(`[sidecar] ${text}`)
})
child.stdout?.on('data', (chunk) => {
  process.stdout.write(`[sidecar] ${chunk}`)
})

try {
  const health = await waitForHealth()
  console.log(`verify-runtime: OK — ${JSON.stringify(health)}`)
} catch (err) {
  fail(err instanceof Error ? err.message : String(err))
} finally {
  child.kill('SIGTERM')
  await new Promise((resolve) => {
    child.on('exit', resolve)
    setTimeout(resolve, 3000)
  })
  if (stderr.includes('NODE_MODULE_VERSION')) {
    fail('native module ABI mismatch — rerun stage-runtime with Electron rebuild env')
  }
}
