#!/usr/bin/env node
/**
 * Electron dev: API sidecar + Vite HMR, then open the desktop window.
 */
import { spawn, spawnSync } from 'node:child_process'
import https from 'node:https'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveElectronExecutable } from './ensure-electron.mjs'
import { NODE_CMD } from './lib/commands.mjs'

const require = createRequire(import.meta.url)
const { resolveApiPort, resolveWebPort, logPortPlan, applyPortEnv } = require('../electron/resolve-ports.cjs')

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DESKTOP_ROOT = path.resolve(__dirname, '..')

spawnSync(NODE_CMD, ['scripts/prepare-icons.mjs'], {
  cwd: DESKTOP_ROOT,
  stdio: 'inherit',
})

async function waitForUrl(url, timeoutMs = 60_000) {
  const started = Date.now()
  const isHttps = url.startsWith('https:')
  while (Date.now() - started < timeoutMs) {
    try {
      if (isHttps) {
        const ok = await new Promise((resolve) => {
          const req = https.get(url, { rejectUnauthorized: false }, (res) => {
            resolve(res.statusCode === 200 || res.statusCode === 304)
            res.resume()
          })
          req.on('error', () => resolve(false))
          req.setTimeout(2500, () => {
            req.destroy()
            resolve(false)
          })
        })
        if (ok) return
      } else {
        const resp = await fetch(url)
        if (resp.ok || resp.status === 304) return
      }
    } catch {
      /* retry */
    }
    await new Promise((resolve) => setTimeout(resolve, 300))
  }
  throw new Error(`Timed out waiting for ${url}`)
}

const apiPlan = await resolveApiPort({ isDev: true, allowBump: true })
const webPlan = await resolveWebPort({ allowBump: true })
logPortPlan(apiPlan, webPlan)

const portEnv = applyPortEnv(apiPlan, webPlan)

const stack = spawn(NODE_CMD, ['scripts/dev-stack.mjs'], {
  cwd: DESKTOP_ROOT,
  stdio: 'inherit',
  shell: false,
  env: {
    ...process.env,
    ...portEnv,
  },
})

stack.on('error', (err) => {
  console.error('[desktop] failed to start dev stack:', err)
  process.exit(1)
})

const cleanup = () => {
  if (!stack.killed) stack.kill('SIGTERM')
}

process.on('SIGINT', () => {
  cleanup()
  process.exit(0)
})
process.on('SIGTERM', () => {
  cleanup()
  process.exit(0)
})

await waitForUrl(`http://127.0.0.1:${apiPlan.port}/api/health`)
const webScheme = process.env.WEB_HTTPS !== '0' ? 'https' : 'http'
await waitForUrl(`${webScheme}://127.0.0.1:${webPlan.port}/`)

const electronPath = resolveElectronExecutable()
const electron = spawn(electronPath, ['.'], {
  cwd: DESKTOP_ROOT,
  stdio: 'inherit',
  shell: false,
  env: {
    ...process.env,
    ...portEnv,
    VITE_DESKTOP: '1',
  },
})

electron.on('exit', (code) => {
  cleanup()
  process.exit(code ?? 0)
})
