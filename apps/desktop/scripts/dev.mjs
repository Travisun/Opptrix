#!/usr/bin/env node
/**
 * Electron dev: API sidecar + Vite HMR, then open the desktop window.
 */
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DESKTOP_ROOT = path.resolve(__dirname, '..')

async function waitForUrl(url, timeoutMs = 60_000) {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    try {
      const resp = await fetch(url)
      if (resp.ok) return
    } catch {
      /* retry */
    }
    await new Promise((resolve) => setTimeout(resolve, 300))
  }
  throw new Error(`Timed out waiting for ${url}`)
}

const stack = spawn('node', ['scripts/dev-stack.mjs'], {
  cwd: DESKTOP_ROOT,
  stdio: 'inherit',
  shell: false,
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

await waitForUrl(`http://127.0.0.1:${process.env.STOCK_RESEARCH_PORT ?? 8711}/api/health`)
await waitForUrl('http://127.0.0.1:5173')

const electron = spawn('npx', ['electron', '.'], {
  cwd: DESKTOP_ROOT,
  stdio: 'inherit',
  shell: true,
  env: {
    ...process.env,
    VITE_DESKTOP: '1',
  },
})

electron.on('exit', (code) => {
  cleanup()
  process.exit(code ?? 0)
})
