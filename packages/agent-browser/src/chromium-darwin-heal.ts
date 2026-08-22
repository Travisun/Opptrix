/**
 * macOS desktop: bundled Playwright Chromium signed with hardened runtime but without
 * disable-library-validation hangs on browser.newPage(). Copy to ~/.opptrix and adhoc re-sign.
 *
 * Self-heal uses adhoc deep sign (no --options runtime) — simpler and reliable vs re-sealing
 * nested frameworks with runtime+entitlements.
 */
import { execFileSync, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { resolveUserDataRoot } from '@opptrix/shared'

const DISABLE_LIB_VALIDATION = 'com.apple.security.cs.disable-library-validation'

export function resolveUserPlaywrightBrowsersDir(): string {
  return path.join(resolveUserDataRoot(), 'playwright-browsers')
}

/** Exported for unit tests — detects hardened runtime without disable-library-validation. */
export function chromeAppNeedsEntitlementsHeal(appPath: string): boolean {
  if (process.platform !== 'darwin' || !fs.existsSync(appPath)) return false

  const probe = spawnSync('codesign', ['-d', '--verbose=4', appPath], { encoding: 'utf8' })
  const probeOut = `${probe.stdout ?? ''}${probe.stderr ?? ''}`
  const hasRuntime =
    /runtime\b/i.test(probeOut)
    || /CodeDirectory v=20500/.test(probeOut)
    || /flags=.*\bruntime\b/.test(probeOut)
  // Adhoc deep-healed copies have no hardened runtime — treat as healthy.
  if (!hasRuntime) return false

  const ent = spawnSync('codesign', ['-d', '--entitlements', '-', '--xml', appPath], {
    encoding: 'utf8',
  })
  const entXml = `${ent.stdout ?? ''}${ent.stderr ?? ''}`
  return !entXml.includes(DISABLE_LIB_VALIDATION)
}

export function findChromeForTestingApp(browsersDir: string): string | null {
  if (!fs.existsSync(browsersDir)) return null
  const stack = [browsersDir]
  while (stack.length > 0) {
    const dir = stack.pop()
    if (!dir) continue
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const full = path.join(dir, entry.name)
      if (entry.name === 'Google Chrome for Testing.app') return full
      stack.push(full)
    }
  }
  return null
}

/** Top-level browser .app bundles to adhoc deep-sign (not nested Helper.apps). */
export function collectBrowserAppsToResign(root: string): string[] {
  const apps: string[] = []
  function walk(dir: string): void {
    if (!fs.existsSync(dir)) return
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const full = path.join(dir, entry.name)
      if (!entry.name.endsWith('.app')) {
        walk(full)
        continue
      }
      if (
        entry.name === 'Google Chrome for Testing.app'
        || /^chrome-headless-shell/i.test(entry.name)
      ) {
        apps.push(full)
      }
      // Do not recurse into .app — Helpers are sealed by outer --deep.
    }
  }
  walk(root)
  return apps
}

function collectNestedBundlesUnderApp(appPath: string): { frameworks: string[]; apps: string[] } {
  const frameworks: string[] = []
  const apps: string[] = []
  function walk(dir: string): void {
    if (!fs.existsSync(dir)) return
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const full = path.join(dir, entry.name)
      if (entry.name.endsWith('.framework')) {
        frameworks.push(full)
        walk(full)
        continue
      }
      if (entry.name.endsWith('.app')) {
        apps.push(full)
        walk(full)
        continue
      }
      walk(full)
    }
  }
  walk(appPath)
  return { frameworks, apps }
}

function removeSignature(target: string): void {
  try {
    execFileSync('codesign', ['--remove-signature', target], {
      stdio: ['ignore', 'ignore', 'pipe'],
    })
  } catch {
    // Already unsigned or partial seal — continue.
  }
}

function adhocDeepSignApp(appPath: string): void {
  const { frameworks } = collectNestedBundlesUnderApp(appPath)
  const nestedFrameworks = frameworks.sort((a, b) => b.length - a.length)

  // Strip outer framework seals only — do not remove Helper.app signatures first
  // (that leaves unsealed contents inside the embedded framework).
  for (const framework of nestedFrameworks) {
    removeSignature(framework)
  }
  removeSignature(appPath)

  execFileSync('codesign', ['--force', '--deep', '--sign', '-', appPath], {
    stdio: ['ignore', 'ignore', 'pipe'],
  })
}

function adhocResignPlaywrightTree(root: string): void {
  const apps = collectBrowserAppsToResign(root)
  if (apps.length === 0) {
    throw new Error(`No Playwright browser .app found under ${root}`)
  }
  for (const app of apps) {
    adhocDeepSignApp(app)
  }
}

function readHealManifest(healDir: string): { sourcePath: string; sourceMtimeMs: number } | null {
  const manifestPath = path.join(healDir, '.heal-manifest.json')
  if (!fs.existsSync(manifestPath)) return null
  try {
    const raw = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as {
      sourcePath?: unknown
      sourceMtimeMs?: unknown
    }
    if (typeof raw.sourcePath !== 'string' || typeof raw.sourceMtimeMs !== 'number') return null
    return { sourcePath: raw.sourcePath, sourceMtimeMs: raw.sourceMtimeMs }
  } catch {
    return null
  }
}

function writeHealManifest(
  healDir: string,
  sourcePath: string,
  sourceMtimeMs: number,
): void {
  fs.mkdirSync(healDir, { recursive: true })
  fs.writeFileSync(
    path.join(healDir, '.heal-manifest.json'),
    JSON.stringify({ sourcePath, sourceMtimeMs, healedAt: new Date().toISOString() }),
    'utf8',
  )
}

function copyBrowsersTree(src: string, dest: string): void {
  if (fs.existsSync(dest)) {
    fs.rmSync(dest, { recursive: true, force: true })
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  // cp -a preserves xattrs/symlinks required for subsequent adhoc deep sign (fs.cpSync breaks seals).
  execFileSync('cp', ['-a', src, dest], { stdio: ['ignore', 'ignore', 'pipe'] })
}

/**
 * When bundled Chromium is runtime-sealed without CS entitlements, copy to user dir and adhoc re-sign.
 * Returns the browsers path to use (healed user dir or original packaged path).
 */
export async function ensureDarwinBundledChromiumHealed(packagedBrowsersPath: string): Promise<string> {
  if (process.platform !== 'darwin') return packagedBrowsersPath

  const chromeApp = findChromeForTestingApp(packagedBrowsersPath)
  if (!chromeApp || !chromeAppNeedsEntitlementsHeal(chromeApp)) {
    return packagedBrowsersPath
  }

  const healDir = resolveUserPlaywrightBrowsersDir()
  let sourceMtimeMs = 0
  try {
    sourceMtimeMs = fs.statSync(packagedBrowsersPath).mtimeMs
  } catch {
    return packagedBrowsersPath
  }

  const manifest = readHealManifest(healDir)
  const healedChrome = findChromeForTestingApp(healDir)
  const healStillValid =
    manifest
    && manifest.sourcePath === packagedBrowsersPath
    && manifest.sourceMtimeMs === sourceMtimeMs
    && healedChrome
    && !chromeAppNeedsEntitlementsHeal(healedChrome)

  if (healStillValid) {
    return healDir
  }

  copyBrowsersTree(packagedBrowsersPath, healDir)
  adhocResignPlaywrightTree(healDir)
  writeHealManifest(healDir, packagedBrowsersPath, sourceMtimeMs)

  const resignedChrome = findChromeForTestingApp(healDir)
  if (!resignedChrome || chromeAppNeedsEntitlementsHeal(resignedChrome)) {
    throw new Error('Failed to heal bundled Playwright Chromium signing')
  }
  return healDir
}
