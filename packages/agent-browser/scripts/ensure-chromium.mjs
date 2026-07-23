#!/usr/bin/env node
/**
 * Ensure Playwright Chromium is installed for @opptrix/agent-browser.
 *
 * Runtime launch uses the full Chromium binary via `chromium.executablePath()`
 * (agent-browser does not depend on chromium-headless-shell). Probing that path
 * is enough; `playwright install chromium` installs full Chromium — we do not
 * require a separate headless-shell download.
 *
 * Usage:
 *   node scripts/ensure-chromium.mjs            # postinstall: install if missing, warn on failure
 *   node scripts/ensure-chromium.mjs --strict   # stage-runtime: fail if install fails
 *   node scripts/ensure-chromium.mjs --check    # exit 0 if present, 1 if missing
 *   node scripts/ensure-chromium.mjs --dry-run  # print planned action, exit 0
 *
 * Skip: OPPTRIX_SKIP_PLAYWRIGHT_BROWSER=1
 * Target dir: PLAYWRIGHT_BROWSERS_PATH (optional; Playwright default cache when unset)
 */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PKG_ROOT = path.resolve(__dirname, '..')

const args = new Set(process.argv.slice(2))
const strict = args.has('--strict')
const checkOnly = args.has('--check')
const dryRun = args.has('--dry-run')

export const PLAYWRIGHT_BROWSERS_DIR_NAME = 'playwright-browsers'

function skipRequested() {
  const v = process.env.OPPTRIX_SKIP_PLAYWRIGHT_BROWSER?.trim()
  return v === '1' || v?.toLowerCase() === 'true'
}

function resolveBrowsersPath() {
  const fromEnv = process.env.PLAYWRIGHT_BROWSERS_PATH?.trim()
  return fromEnv || null
}

/** Prefer staged runtime deps (NODE_PATH) so browser revision matches sidecar Playwright. */
function resolveModuleSearchPaths() {
  const paths = [PKG_ROOT]
  const nodePath = process.env.NODE_PATH?.split(path.delimiter).filter(Boolean) ?? []
  for (const entry of nodePath) {
    paths.push(entry)
  }
  return paths
}

function resolvePlaywrightCli() {
  const pkgJson = require.resolve('playwright/package.json', { paths: resolveModuleSearchPaths() })
  return path.join(path.dirname(pkgJson), 'cli.js')
}

function isChromiumInstalled(browsersPath) {
  const prev = process.env.PLAYWRIGHT_BROWSERS_PATH
  if (browsersPath) {
    process.env.PLAYWRIGHT_BROWSERS_PATH = browsersPath
  }
  try {
    const { chromium } = require('playwright-core', { paths: resolveModuleSearchPaths() })
    const exe = chromium.executablePath()
    return fs.existsSync(exe)
  } catch {
    return false
  } finally {
    if (browsersPath) {
      if (prev == null) delete process.env.PLAYWRIGHT_BROWSERS_PATH
      else process.env.PLAYWRIGHT_BROWSERS_PATH = prev
    }
  }
}

function installChromium(browsersPath) {
  let cli
  try {
    cli = resolvePlaywrightCli()
  } catch (err) {
    console.error(
      'Playwright CLI not found. Ensure the `playwright` package is installed'
      + ` (same major as playwright-core). ${err instanceof Error ? err.message : err}`,
    )
    return false
  }

  const env = { ...process.env }
  if (browsersPath) {
    env.PLAYWRIGHT_BROWSERS_PATH = browsersPath
    fs.mkdirSync(browsersPath, { recursive: true })
  }

  console.log(
    browsersPath
      ? `Installing Playwright Chromium into ${browsersPath}…`
      : 'Installing Playwright Chromium (default cache)…',
  )

  const result = spawnSync(process.execPath, [cli, 'install', 'chromium'], {
    cwd: PKG_ROOT,
    env,
    stdio: 'inherit',
  })
  return result.status === 0
}

function failOrWarn(message, code) {
  if (strict) {
    console.error(message)
    process.exit(code)
  }
  console.warn(message)
  process.exit(0)
}

function main() {
  const browsersPath = resolveBrowsersPath()

  if (skipRequested()) {
    console.log('Skipping Playwright Chromium install (OPPTRIX_SKIP_PLAYWRIGHT_BROWSER=1)')
    process.exit(0)
  }

  if (isChromiumInstalled(browsersPath)) {
    if (checkOnly || dryRun) {
      console.log('Playwright Chromium is already installed.')
    }
    process.exit(0)
  }

  if (checkOnly) {
    console.error(
      browsersPath
        ? `Playwright Chromium not found under ${browsersPath}.`
        : 'Playwright Chromium not found in the default cache.',
    )
    process.exit(1)
  }

  if (dryRun) {
    console.log(
      browsersPath
        ? `Would install Playwright Chromium into ${browsersPath}.`
        : 'Would install Playwright Chromium into the default Playwright cache.',
    )
    process.exit(0)
  }

  if (!installChromium(browsersPath)) {
    failOrWarn(
      'Failed to install Playwright Chromium.'
      + ' Agent browser tools need Chromium; retry when online or run'
      + ' `npm run install-browser -w @opptrix/agent-browser`.'
      + ' Set OPPTRIX_SKIP_PLAYWRIGHT_BROWSER=1 to skip auto-install.',
      1,
    )
  }

  if (!isChromiumInstalled(browsersPath)) {
    failOrWarn('Playwright Chromium install finished but the executable is still missing.', 1)
  }

  console.log('Playwright Chromium is ready.')
  process.exit(0)
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  main()
}
