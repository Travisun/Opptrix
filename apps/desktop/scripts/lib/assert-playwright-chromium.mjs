/**
 * Confirm playwright-browsers contains the full Chromium binary that runtime
 * launch uses via `chromium.executablePath()` — not merely that the directory exists.
 */
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'

/**
 * @param {string} browsersDir - PLAYWRIGHT_BROWSERS_PATH (staged/packaged playwright-browsers)
 * @param {string[]} nodeModulesDirs - dirs that directly contain playwright-core/ (prefer staged)
 * @param {(msg: string) => never} fail
 * @returns {string} absolute Chromium executable path
 */
export function assertPlaywrightChromiumExecutable(browsersDir, nodeModulesDirs, fail) {
  if (!fs.existsSync(browsersDir)) {
    fail(
      `missing ${browsersDir} — stage-runtime must install Playwright Chromium`,
    )
  }

  const candidates = nodeModulesDirs.filter((dir) => fs.existsSync(dir))
  if (candidates.length === 0) {
    fail(
      `cannot resolve playwright-core — no node_modules among: ${nodeModulesDirs.join(', ')}`,
    )
  }

  const prev = process.env.PLAYWRIGHT_BROWSERS_PATH
  process.env.PLAYWRIGHT_BROWSERS_PATH = browsersDir
  try {
    let chromium = null
    let lastErr = null
    for (const nm of candidates) {
      const pkgJson = path.join(nm, 'playwright-core', 'package.json')
      if (!fs.existsSync(pkgJson)) {
        lastErr = new Error(`missing ${pkgJson}`)
        continue
      }
      try {
        const req = createRequire(pkgJson)
        ;({ chromium } = req('.'))
        break
      } catch (err) {
        lastErr = err
      }
    }
    if (!chromium) {
      fail(
        `playwright-core not found under staged deps (searched ${candidates.join(', ')}): `
        + `${lastErr instanceof Error ? lastErr.message : lastErr}`,
      )
    }

    const exe = chromium.executablePath()
    if (!exe || !fs.existsSync(exe)) {
      fail(
        `Playwright Chromium executable missing under ${browsersDir}`
        + ` (resolved ${exe || 'n/a'}). `
        + 'An empty playwright-browsers directory is not enough — '
        + 'run stage-runtime to install the full Chromium binary.',
      )
    }
    return exe
  } finally {
    if (prev == null) delete process.env.PLAYWRIGHT_BROWSERS_PATH
    else process.env.PLAYWRIGHT_BROWSERS_PATH = prev
  }
}
