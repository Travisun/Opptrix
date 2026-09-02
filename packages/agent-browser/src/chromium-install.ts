/**
 * Chromium install / probe for @opptrix/agent-browser.
 *
 * Docker/self-host: PLAYWRIGHT_BROWSERS_PATH is pre-seeded in the image (see Dockerfile).
 * Bare Node: runs `playwright install chromium` on first use unless OPPTRIX_SKIP_PLAYWRIGHT_BROWSER=1.
 */
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

const isDockerEnv = (): boolean => process.env.OPPTRIX_DOCKER === '1'

const require = createRequire(import.meta.url)
const PKG_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/** Default browsers dir inside Docker images (see scripts/lib/ci-pins.env). */
export const DOCKER_PLAYWRIGHT_BROWSERS_PATH = '/opt/opptrix/playwright-browsers'
export const PLAYWRIGHT_BROWSERS_DIR_NAME = 'playwright-browsers'

const DEFAULT_INSTALL_TIMEOUT_MS = 120_000

let ensureInFlight: Promise<boolean> | null = null

function defaultDockerBrowsersPath(): string | null {
  if (process.env.OPPTRIX_DOCKER !== '1') return null
  const fromEnv = process.env.PLAYWRIGHT_BROWSERS_PATH?.trim()
  if (fromEnv) return fromEnv
  return fs.existsSync(DOCKER_PLAYWRIGHT_BROWSERS_PATH)
    ? DOCKER_PLAYWRIGHT_BROWSERS_PATH
    : null
}

function applyPlaywrightBrowsersPath(browsersPath: string): void {
  process.env.PLAYWRIGHT_BROWSERS_PATH = browsersPath
}

/** Apply PLAYWRIGHT_BROWSERS_PATH before Playwright resolves executables. */
export function configurePlaywrightBrowsersPath(): void {
  if (process.env.PLAYWRIGHT_BROWSERS_PATH?.trim()) return
  const dockerPath = defaultDockerBrowsersPath()
  if (dockerPath) {
    applyPlaywrightBrowsersPath(dockerPath)
  }
}

/** True when the full Chromium executable exists (same path used at launch). */
export function isChromiumAvailable(): boolean {
  configurePlaywrightBrowsersPath()
  try {
    const exe = chromium.executablePath()
    return fs.existsSync(exe)
  } catch {
    return false
  }
}

function resolvePlaywrightCli(): string {
  const pkgJson = require.resolve('playwright/package.json', { paths: [PKG_ROOT] })
  return path.join(path.dirname(pkgJson), 'cli.js')
}

function spawnPlaywrightInstall(timeoutMs: number): Promise<boolean> {
  configurePlaywrightBrowsersPath()
  const browsersPath = process.env.PLAYWRIGHT_BROWSERS_PATH?.trim()
    ?? path.join(process.cwd(), PLAYWRIGHT_BROWSERS_DIR_NAME)
  fs.mkdirSync(browsersPath, { recursive: true })
  applyPlaywrightBrowsersPath(browsersPath)

  let cli: string
  try {
    cli = resolvePlaywrightCli()
  } catch {
    return Promise.resolve(false)
  }

  return new Promise((resolve) => {
    const child = spawn(process.execPath, [cli, 'install', 'chromium'], {
      cwd: PKG_ROOT,
      env: process.env,
      stdio: 'inherit',
    })

    const timer = setTimeout(() => {
      child.kill('SIGTERM')
      resolve(false)
    }, timeoutMs)

    child.on('error', () => {
      clearTimeout(timer)
      resolve(false)
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      resolve(code === 0)
    })
  })
}

/**
 * Ensure Chromium exists; Docker images should already have browsers under PLAYWRIGHT_BROWSERS_PATH.
 */
export async function ensureChromiumAvailable(
  opts?: { timeoutMs?: number },
): Promise<boolean> {
  if (process.env.OPPTRIX_SKIP_PLAYWRIGHT_BROWSER === '1') return false
  configurePlaywrightBrowsersPath()
  if (isChromiumAvailable()) return true
  if (isDockerEnv() && process.env.OPPTRIX_PLAYWRIGHT_AUTO_INSTALL !== '1') {
    return false
  }
  if (!ensureInFlight) {
    const timeoutMs = opts?.timeoutMs ?? DEFAULT_INSTALL_TIMEOUT_MS
    ensureInFlight = spawnPlaywrightInstall(timeoutMs).finally(() => {
      ensureInFlight = null
    })
  }
  const ok = await ensureInFlight
  return ok && isChromiumAvailable()
}
