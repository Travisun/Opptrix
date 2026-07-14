#!/usr/bin/env node
/**
 * Stage electron-updater + runtime deps for the packaged Electron main process.
 *
 * Layout: build/updater-deps/packages/<name>/ (flat vendor — no `node_modules` in path).
 * electron-builder skips any directory named node_modules during the app file walk;
 * a nested node_modules path caused packaged builds to omit the updater entirely.
 */
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import {
  UPDATER_ENTRY,
  UPDATER_VENDOR_DIR,
} from './lib/updater-vendor-paths.mjs'

const DESKTOP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const desktopRequire = createRequire(path.join(DESKTOP_ROOT, 'package.json'))

function rm(dir) {
  fs.rmSync(dir, { recursive: true, force: true })
}

function shouldSkipCopyPath(src, pkgRoot) {
  const rel = path.relative(pkgRoot, src)
  if (rel === 'node_modules') return true
  return rel.startsWith(`node_modules${path.sep}`)
}

function resolvePackageDir(name, resolveFromDir) {
  const attempts = [
    resolveFromDir,
    DESKTOP_ROOT,
    path.dirname(desktopRequire.resolve('electron-updater/package.json')),
  ]
  const errors = []
  for (const fromDir of attempts) {
    try {
      const req = createRequire(path.join(fromDir, 'package.json'))
      return path.dirname(req.resolve(`${name}/package.json`))
    } catch (err) {
      errors.push(`${fromDir}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
  throw new Error(
    `electron-updater dependency missing: ${name}\n` + errors.map((e) => `  - ${e}`).join('\n'),
  )
}

function copyPackage(name, copied, resolveFromDir = DESKTOP_ROOT) {
  if (copied.has(name)) return
  copied.add(name)

  const pkgDir = resolvePackageDir(name, resolveFromDir)
  const destDir = path.join(UPDATER_VENDOR_DIR, name)
  fs.cpSync(pkgDir, destDir, {
    recursive: true,
    filter: (src) => !shouldSkipCopyPath(src, pkgDir),
  })

  const pkgJson = JSON.parse(fs.readFileSync(path.join(destDir, 'package.json'), 'utf8'))
  for (const dep of Object.keys(pkgJson.dependencies ?? {})) {
    // Nested deps (e.g. fs-extra) often live under electron-updater/node_modules —
    // resolve relative to the parent package dir, not the desktop workspace root.
    copyPackage(dep, copied, pkgDir)
  }
}

rm(path.dirname(UPDATER_VENDOR_DIR))
fs.mkdirSync(UPDATER_VENDOR_DIR, { recursive: true })
copyPackage(UPDATER_ENTRY, new Set(), DESKTOP_ROOT)

if (!fs.existsSync(path.join(UPDATER_VENDOR_DIR, UPDATER_ENTRY, 'package.json'))) {
  throw new Error(`Staging failed: missing ${UPDATER_ENTRY} in ${UPDATER_VENDOR_DIR}`)
}
if (!fs.existsSync(path.join(UPDATER_VENDOR_DIR, 'fs-extra', 'package.json'))) {
  throw new Error(`Staging failed: missing fs-extra in ${UPDATER_VENDOR_DIR}`)
}

console.log(`Updater deps staged at ${UPDATER_VENDOR_DIR}`)
