import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
export const REPO_ROOT = path.resolve(__dirname, '../../../../')

export const SERVER_ENTRY = path.join(REPO_ROOT, 'apps/server/dist/index.js')
export const UI_DIST = path.join(REPO_ROOT, 'client-ui/dist')

export function serverEnv(extra = {}) {
  return {
    ...process.env,
    SERVE_UI: '1',
    INNO_DESKTOP: '1',
    STOCK_RESEARCH_HOST: '127.0.0.1',
    STOCK_RESEARCH_PORT: process.env.STOCK_RESEARCH_PORT ?? '8711',
    UI_DIST_PATH: UI_DIST,
    ...extra,
  }
}

export function assertServerBuilt() {
  if (!fs.existsSync(SERVER_ENTRY)) {
    throw new Error(`Server not built: ${SERVER_ENTRY}\nRun: npm run build:packages`)
  }
}

export function spawnServer() {
  assertServerBuilt()
  return spawn(process.execPath, [SERVER_ENTRY], {
    env: serverEnv(),
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: false,
  })
}

export async function waitForHealth(
  port = Number(process.env.STOCK_RESEARCH_PORT ?? 8711),
  timeoutMs = 30_000,
) {
  const started = Date.now()
  const url = `http://127.0.0.1:${port}/api/health`
  while (Date.now() - started < timeoutMs) {
    try {
      const resp = await fetch(url)
      if (resp.ok) return
    } catch { /* retry */ }
    await new Promise(r => setTimeout(r, 250))
  }
  throw new Error(`API not ready at ${url}`)
}
