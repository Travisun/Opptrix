/**
 * Confirm playwright-browsers contains the full Chromium binary that runtime
 * launch uses via `chromium.executablePath()` — not merely that the directory exists.
 */
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import {
  playwrightChromiumDirMarker,
  playwrightHostPlatformOverride,
} from './playwright-host-platform.mjs'

/**
 * @param {string} browsersDir - PLAYWRIGHT_BROWSERS_PATH (staged/packaged playwright-browsers)
 * @param {string[]} nodeModulesDirs - dirs that directly contain playwright-core/ (prefer staged)
 * @param {(msg: string) => never} fail
 * @param {{ platform: string, arch: string } | null} [target] - packaging target (cross-build override)
 * @returns {string} absolute Chromium executable path
 */
export function assertPlaywrightChromiumExecutable(browsersDir, nodeModulesDirs, fail, target = null) {
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

  const prevBrowsers = process.env.PLAYWRIGHT_BROWSERS_PATH
  const prevOverride = process.env.PLAYWRIGHT_HOST_PLATFORM_OVERRIDE
  process.env.PLAYWRIGHT_BROWSERS_PATH = browsersDir
  const override = target ? playwrightHostPlatformOverride(target) : null
  if (override) {
    process.env.PLAYWRIGHT_HOST_PLATFORM_OVERRIDE = override
  }
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
    const marker = target ? playwrightChromiumDirMarker(target) : null
    if (marker && !exe.includes(marker)) {
      fail(
        `Playwright Chromium path does not match packaging target `
        + `${target.platform}-${target.arch}: expected path containing ${marker}, got ${exe}. `
        + 'Cross-builds must set PLAYWRIGHT_HOST_PLATFORM_OVERRIDE during stage-runtime.',
      )
    }
    return exe
  } finally {
    if (prevBrowsers == null) delete process.env.PLAYWRIGHT_BROWSERS_PATH
    else process.env.PLAYWRIGHT_BROWSERS_PATH = prevBrowsers
    if (prevOverride == null) delete process.env.PLAYWRIGHT_HOST_PLATFORM_OVERRIDE
    else process.env.PLAYWRIGHT_HOST_PLATFORM_OVERRIDE = prevOverride
  }
}
