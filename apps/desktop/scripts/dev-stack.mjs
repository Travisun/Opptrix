#!/usr/bin/env node
/**
 * Dev stack for Electron: API sidecar + Vite (web HMR).
 */
import { spawn } from 'node:child_process'
import {
  REPO_ROOT, spawnServer, waitForHealth, assertServerBuilt,
} from './lib/paths.mjs'
import { NPM_CMD, NPM_SHELL } from './lib/commands.mjs'

assertServerBuilt()

const apiPort = Number(process.env.STOCK_RESEARCH_PORT ?? 8711)
const webPort = Number(process.env.WEB_PORT ?? 5173)
const apiMode = process.env.OPPTRIX_API_PORT_MODE ?? 'use'
const apiProxyTarget = process.env.API_PROXY_TARGET ?? `http://127.0.0.1:${apiPort}`

/** @type {import('node:child_process').ChildProcess | null} */
let server = null

if (apiMode !== 'reuse') {
  server = spawnServer()
  server.stdout?.on('data', (d) => process.stdout.write(`[api] ${d}`))
  server.stderr?.on('data', (d) => process.stderr.write(`[api] ${d}`))
} else {
  console.log(`[api] 复用已在运行的 Opptrix API（:${apiPort}）`)
}

const cleanup = () => {
  if (server && !server.killed) server.kill('SIGTERM')
}
process.on('SIGINT', () => { cleanup(); process.exit(0) })
process.on('SIGTERM', () => { cleanup(); process.exit(0) })

await waitForHealth(apiPort)

const vite = spawn(NPM_CMD, ['run', 'dev', '-w', 'opptrix-client'], {
  cwd: REPO_ROOT,
  stdio: 'inherit',
  shell: NPM_SHELL,
  env: {
    ...process.env,
    WEB_PORT: String(webPort),
    API_PROXY_TARGET: apiProxyTarget,
    VITE_DESKTOP: '1',
  },
})

vite.on('error', (err) => {
  console.error('[web] failed to start Vite dev server:', err)
  cleanup()
  process.exit(1)
})

vite.on('exit', (code) => {
  cleanup()
  process.exit(code ?? 0)
})
