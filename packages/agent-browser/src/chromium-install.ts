/**
 * Chromium install / probe for @opptrix/agent-browser.
 *
 * Runtime launch uses the full Chromium binary via `chromium.executablePath()`
 * (see playwright-session.ts). Probing that path is enough — we intentionally do
 * NOT depend on Playwright's chromium-headless-shell. Keep `playwright install chromium`
 * (do not add `--with-deps` / force a separate shell download for our headless path).
 */
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'
import { isDesktopRuntime } from '@opptrix/shared'

const require = createRequire(import.meta.url)
const PKG_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/** Relative directory inside desktop runtime-stage / packaged app resources. */
export const PLAYWRIGHT_BROWSERS_DIR_NAME = 'playwright-browsers'

const DEFAULT_INSTALL_TIMEOUT_MS = 120_000

let ensureInFlight: Promise<boolean> | null = null

export function resolvePackagedBrowsersPath(): string | null {
  if (!isDesktopRuntime()) return null
  const packaged = path.join(process.cwd(), PLAYWRIGHT_BROWSERS_DIR_NAME)
  return fs.existsSync(packaged) ? packaged : null
}

/** Apply PLAYWRIGHT_BROWSERS_PATH for packaged desktop before Playwright resolves executables. */
export function configurePlaywrightBrowsersPath(): void {
  if (process.env.PLAYWRIGHT_BROWSERS_PATH?.trim()) return
  const packaged = resolvePackagedBrowsersPath()
  if (packaged) {
    process.env.PLAYWRIGHT_BROWSERS_PATH = packaged
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
  if (browsersPath) {
    fs.mkdirSync(browsersPath, { recursive: true })
  }

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
 * Ensure Chromium exists; no-op when already installed or skip env is set.
 * Concurrent callers share one install attempt.
 */
export async function ensureChromiumAvailable(
  opts?: { timeoutMs?: number },
): Promise<boolean> {
  if (process.env.OPPTRIX_SKIP_PLAYWRIGHT_BROWSER === '1') return false
  if (isChromiumAvailable()) return true
  if (!ensureInFlight) {
    const timeoutMs = opts?.timeoutMs ?? DEFAULT_INSTALL_TIMEOUT_MS
    ensureInFlight = spawnPlaywrightInstall(timeoutMs).finally(() => {
      ensureInFlight = null
    })
  }
  const ok = await ensureInFlight
  return ok && isChromiumAvailable()
}
