#!/usr/bin/env node
/**
 * Dev API supervisor:
 * - Restarts the server when it crashes (node --watch only waits for file changes).
 * - Reloads when apps/server/dist changes (tsc output), not monorepo package dist.
 */
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const ENTRY = path.join(ROOT, 'dist', 'index.js')

let shuttingDown = false
let child = null
let lastMtime = 0
let restartTimer = null
let reloadPending = false

function start() {
  if (shuttingDown) return
  child = spawn(process.execPath, [ENTRY], {
    cwd: ROOT,
    stdio: 'inherit',
    env: process.env,
  })
  child.on('exit', (code, signal) => {
    child = null
    if (shuttingDown) {
      process.exit(code ?? 0)
      return
    }
    if (reloadPending) {
      reloadPending = false
      start()
      return
    }
    if (signal === 'SIGTERM' || signal === 'SIGINT') return
    console.error(`\n[api] process exited (${code ?? signal ?? 'unknown'}), restarting in 2s…\n`)
    restartTimer = setTimeout(start, 2000)
  })
}

function watchDist() {
  if (shuttingDown) return
  try {
    const st = fs.statSync(ENTRY)
    if (lastMtime > 0 && st.mtimeMs !== lastMtime && child) {
      console.log('\n[api] server dist changed, restarting…\n')
      reloadPending = true
      child.kill('SIGTERM')
    }
    lastMtime = st.mtimeMs
  } catch {
    // dist not built yet
  }
  setTimeout(watchDist, 1000)
}

function shutdown() {
  if (shuttingDown) return
  shuttingDown = true
  if (restartTimer) clearTimeout(restartTimer)
  if (child) child.kill('SIGTERM')
  else process.exit(0)
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

start()
watchDist()
