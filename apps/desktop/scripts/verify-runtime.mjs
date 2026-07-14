#!/usr/bin/env node
/** Smoke-test staged sidecar: native modules load + /api/health responds. */
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { hostMatchesTarget, resolveRuntimeTarget } from './lib/runtime-target.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DESKTOP_ROOT = path.resolve(__dirname, '..')
const REPO_ROOT = path.resolve(DESKTOP_ROOT, '../..')
const STAGE = path.join(DESKTOP_ROOT, 'runtime-stage')
const PORT = process.env.STOCK_RESEARCH_PORT ?? '18711'

const require = createRequire(path.join(DESKTOP_ROOT, 'package.json'))

function fail(msg) {
  console.error(`verify-runtime: ${msg}`)
  process.exit(1)
}

const target = resolveRuntimeTarget()

const entry = path.join(STAGE, 'apps/server/dist/index.js')
if (!fs.existsSync(entry)) {
  fail(`missing server entry ${entry} — run prebuild first`)
}

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

const sqliteNode = path.join(STAGE, 'node_modules/better-sqlite3/build/Release/better_sqlite3.node')
if (!fs.existsSync(sqliteNode)) {
  fail(`missing ${sqliteNode} — run stage-runtime.mjs`)
}

const duckdbNode = path.join(STAGE, 'node_modules/duckdb/lib/binding/duckdb.node')
if (!fs.existsSync(duckdbNode)) {
  fail(`missing ${duckdbNode} — run stage-runtime.mjs`)
}

const duckdbNeoPkg = `@duckdb/node-bindings-${target.platform}-${target.arch}`
const duckdbNeoNode = path.join(STAGE, 'node_modules', ...duckdbNeoPkg.split('/'), 'duckdb.node')
const duckdbNeoMeta = path.join(STAGE, 'node_modules/@duckdb/node-bindings/package.json')
if (fs.existsSync(duckdbNeoMeta) && !fs.existsSync(duckdbNeoNode)) {
  fail(`missing ${duckdbNeoNode} — run stage-runtime.mjs (${duckdbNeoPkg})`)
}

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
    NODE_PATH: path.join(STAGE, 'node_modules'),
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
