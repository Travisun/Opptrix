#!/usr/bin/env node
/**
 * Web dev: resolve API/Web ports, then start API (if needed) + Vite.
 */
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '..')
const require = createRequire(path.join(REPO_ROOT, 'package.json'))
const { resolveApiPort, resolveWebPort, logPortPlan, applyPortEnv } = require(
  path.join(REPO_ROOT, 'apps/desktop/electron/resolve-ports.cjs'),
)
const { NPM_CMD, NPM_SHELL } = require(path.join(REPO_ROOT, 'apps/desktop/scripts/lib/commands.mjs'))

const apiPlan = await resolveApiPort({ isDev: true, allowBump: true })
const webPlan = await resolveWebPort({ allowBump: true })
logPortPlan(apiPlan, webPlan)

const portEnv = applyPortEnv(apiPlan, webPlan)
const sharedEnv = { ...process.env, ...portEnv }

const children = []

function spawnNpm(script, name) {
  const child = spawn(NPM_CMD, ['run', script], {
    cwd: REPO_ROOT,
    stdio: 'inherit',
    shell: NPM_SHELL,
    env: sharedEnv,
  })
  children.push(child)
  child.on('exit', (code) => {
    if (code && code !== 0) cleanup(code)
  })
  return child
}

function cleanup(code = 0) {
  for (const child of children) {
    if (!child.killed) child.kill('SIGTERM')
  }
  process.exit(code)
}

process.on('SIGINT', () => cleanup(0))
process.on('SIGTERM', () => cleanup(0))

if (apiPlan.mode !== 'reuse') {
  spawnNpm('dev:api', 'api')
} else {
  console.log(`[api] 复用已在运行的 Opptrix API（:${apiPlan.port}）`)
}

spawnNpm('dev:web', 'web')
