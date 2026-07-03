#!/usr/bin/env node
/**
 * Dev stack for Electron: API sidecar + Vite (web HMR).
 */
import { spawn } from 'node:child_process'
import {
  REPO_ROOT, spawnServer, waitForHealth, assertServerBuilt,
} from './lib/paths.mjs'

assertServerBuilt()

const server = spawnServer()
server.stdout?.on('data', d => process.stdout.write(`[api] ${d}`))
server.stderr?.on('data', d => process.stderr.write(`[api] ${d}`))

const cleanup = () => {
  if (!server.killed) server.kill('SIGTERM')
}
process.on('SIGINT', () => { cleanup(); process.exit(0) })
process.on('SIGTERM', () => { cleanup(); process.exit(0) })

await waitForHealth()

const vite = spawn('npm', ['run', 'dev', '-w', 'opptrix-client'], {
  cwd: REPO_ROOT,
  stdio: 'inherit',
  shell: false,
  env: {
    ...process.env,
    API_PROXY_TARGET: 'http://127.0.0.1:8711',
    VITE_DESKTOP: '1',
  },
})

vite.on('exit', code => {
  cleanup()
  process.exit(code ?? 0)
})
