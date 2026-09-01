#!/usr/bin/env node
/**
 * Bare-Node process supervisor — same restart semantics as Docker entrypoint.
 *
 * Ensures `$OPPTRIX_SYSTEM_DIR` layout (seed if needed), activates pending if any,
 * then runs the server from the `boot` slot with a restart loop:
 *
 *   exit 42  → activate pending (if any), restart   (OPPTRIX_EXIT_RESTART_APPLY)
 *   exit 43  → restart without activate             (OPPTRIX_EXIT_RESTART_POST_HOOK)
 *   exit 44  → restart without activate             (OPPTRIX_EXIT_RESTART_ROLLBACK)
 *   other ≠0 → log, sleep backoff, restart
 *   exit 0   → restart unless OPPTRIX_ONCE=1
 *
 * Usage (from repo / seeded tree):
 *   export OPPTRIX_SYSTEM_DIR=~/.opptrix/system
 *   export OPPTRIX_SEED_ROOT="$(pwd)"   # optional; default cwd
 *   node scripts/opptrix-node-supervisor.mjs
 *   # or with custom CMD:
 *   node scripts/opptrix-node-supervisor.mjs node apps/server/dist/index.js
 *
 * Env:
 *   OPPTRIX_SYSTEM_DIR, OPPTRIX_SEED_ROOT, OPPTRIX_APP_VERSION
 *   OPPTRIX_ONCE=1           — exit container/process on server exit 0
 *   OPPTRIX_SUPERVISOR_MAX_RETRIES — optional cap on consecutive crash restarts (default unlimited)
 */
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SYSTEM_BOOT = path.join(__dirname, 'system-boot.mjs')

const EXIT_APPLY = 42
const EXIT_POST_HOOK = 43
const EXIT_ROLLBACK = 44

const MAX_BACKOFF_MS = 30_000
const BASE_BACKOFF_MS = 1_000

function runNodeScript(scriptPath, args = []) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [scriptPath, ...args], {
      stdio: 'inherit',
      env: process.env,
    })
    child.on('error', reject)
    child.on('exit', (code, signal) => {
      if (signal) {
        reject(new Error(`${path.basename(scriptPath)} killed by ${signal}`))
        return
      }
      if (code !== 0) {
        reject(new Error(`${path.basename(scriptPath)} exited ${code}`))
        return
      }
      resolve()
    })
  })
}

function printBootPath() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [SYSTEM_BOOT, 'print-boot'], {
      stdio: ['ignore', 'pipe', 'inherit'],
      env: process.env,
    })
    let out = ''
    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (chunk) => {
      out += chunk
    })
    child.on('error', reject)
    child.on('exit', (code, signal) => {
      if (signal) {
        reject(new Error(`print-boot killed by ${signal}`))
        return
      }
      if (code !== 0) {
        reject(new Error(`print-boot exited ${code}`))
        return
      }
      const boot = out.trim()
      if (!boot) {
        reject(new Error('print-boot returned empty path'))
        return
      }
      resolve(boot)
    })
  })
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

/**
 * @param {string} boot
 * @param {string[]} cmd
 * @returns {Promise<number>}
 */
function runServer(boot, cmd) {
  return new Promise((resolve, reject) => {
    const [bin, ...args] = cmd
    if (!bin) {
      reject(new Error('empty server command'))
      return
    }
    const child = spawn(bin, args, {
      cwd: boot,
      stdio: 'inherit',
      env: {
        ...process.env,
        UI_DIST_PATH: process.env.UI_DIST_PATH || path.join(boot, 'client-ui', 'dist'),
      },
    })
    child.on('error', reject)
    child.on('exit', (code, signal) => {
      if (signal) {
        // Treat termination signals as clean stop of supervisor
        if (signal === 'SIGINT' || signal === 'SIGTERM') {
          resolve(0)
          return
        }
        resolve(1)
        return
      }
      resolve(code ?? 1)
    })
  })
}

async function prepareBoot() {
  await runNodeScript(SYSTEM_BOOT, ['ensure'])
  await runNodeScript(SYSTEM_BOOT, ['activate-pending'])
  return printBootPath()
}

async function main() {
  if (!fs.existsSync(SYSTEM_BOOT)) {
    throw new Error(`missing ${SYSTEM_BOOT}`)
  }

  const userCmd = process.argv.slice(2)
  const defaultCmd = [process.execPath, 'apps/server/dist/index.js']
  const serverCmd = userCmd.length > 0 ? userCmd : defaultCmd

  const once = process.env.OPPTRIX_ONCE === '1'
  const maxRetriesRaw = process.env.OPPTRIX_SUPERVISOR_MAX_RETRIES?.trim()
  /** @type {number} */
  let maxRetries = Infinity
  if (maxRetriesRaw) {
    maxRetries = Number(maxRetriesRaw)
    if (!Number.isFinite(maxRetries) || maxRetries < 0) {
      throw new Error('OPPTRIX_SUPERVISOR_MAX_RETRIES must be a non-negative number')
    }
  }

  let crashStreak = 0
  let backoffMs = BASE_BACKOFF_MS

  for (;;) {
    const boot = await prepareBoot()
    const entry = path.join(boot, 'apps', 'server', 'dist', 'index.js')
    if (!fs.existsSync(entry) && serverCmd[1] === 'apps/server/dist/index.js') {
      throw new Error(`server entry missing under boot: ${entry}`)
    }

    process.stderr.write(
      `[opptrix-supervisor] boot=${boot} cmd=${serverCmd.join(' ')}\n`,
    )
    const code = await runServer(boot, serverCmd)
    process.stderr.write(`[opptrix-supervisor] server exited code=${code}\n`)

    if (code === EXIT_APPLY) {
      process.stderr.write('[opptrix-supervisor] exit 42 → activate pending, restart\n')
      try {
        await runNodeScript(SYSTEM_BOOT, ['activate-pending'])
      } catch (err) {
        process.stderr.write(
          `[opptrix-supervisor] activate-pending failed: ${err instanceof Error ? err.message : String(err)}\n`,
        )
      }
      crashStreak = 0
      backoffMs = BASE_BACKOFF_MS
      continue
    }

    if (code === EXIT_POST_HOOK || code === EXIT_ROLLBACK) {
      process.stderr.write(
        `[opptrix-supervisor] exit ${code} → soft restart (no activate)\n`,
      )
      crashStreak = 0
      backoffMs = BASE_BACKOFF_MS
      continue
    }

    if (code === 0) {
      if (once) {
        process.stderr.write('[opptrix-supervisor] exit 0 + OPPTRIX_ONCE=1 → stop\n')
        process.exit(0)
      }
      process.stderr.write('[opptrix-supervisor] exit 0 → restart (set OPPTRIX_ONCE=1 to stop)\n')
      crashStreak = 0
      backoffMs = BASE_BACKOFF_MS
      continue
    }

    crashStreak += 1
    if (crashStreak > maxRetries) {
      process.stderr.write(
        `[opptrix-supervisor] exceeded OPPTRIX_SUPERVISOR_MAX_RETRIES=${maxRetries} — giving up\n`,
      )
      process.exit(code)
    }
    process.stderr.write(
      `[opptrix-supervisor] crash #${crashStreak} — backoff ${backoffMs}ms then restart\n`,
    )
    await sleep(backoffMs)
    backoffMs = Math.min(MAX_BACKOFF_MS, backoffMs * 2)
  }
}

main().catch((err) => {
  process.stderr.write(
    `[opptrix-supervisor] FATAL: ${err instanceof Error ? err.message : String(err)}\n`,
  )
  process.exit(1)
})
