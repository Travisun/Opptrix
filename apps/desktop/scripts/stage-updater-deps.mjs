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
const require = createRequire(path.join(DESKTOP_ROOT, 'package.json'))

function rm(dir) {
  fs.rmSync(dir, { recursive: true, force: true })
}

function shouldSkipCopyPath(src, pkgRoot) {
  const rel = path.relative(pkgRoot, src)
  if (rel === 'node_modules') return true
  return rel.startsWith(`node_modules${path.sep}`)
}

function copyPackage(name, copied) {
  if (copied.has(name)) return
  copied.add(name)

  let pkgDir
  try {
    pkgDir = path.dirname(require.resolve(`${name}/package.json`))
  } catch {
    throw new Error(`electron-updater dependency missing: ${name}`)
  }

  const destDir = path.join(UPDATER_VENDOR_DIR, name)
  fs.cpSync(pkgDir, destDir, {
    recursive: true,
    filter: (src) => !shouldSkipCopyPath(src, pkgDir),
  })

  const pkgJson = JSON.parse(fs.readFileSync(path.join(destDir, 'package.json'), 'utf8'))
  for (const dep of Object.keys(pkgJson.dependencies ?? {})) {
    copyPackage(dep, copied)
  }
}

rm(path.dirname(UPDATER_VENDOR_DIR))
fs.mkdirSync(UPDATER_VENDOR_DIR, { recursive: true })
copyPackage(UPDATER_ENTRY, new Set())

if (!fs.existsSync(path.join(UPDATER_VENDOR_DIR, UPDATER_ENTRY, 'package.json'))) {
  throw new Error(`Staging failed: missing ${UPDATER_ENTRY} in ${UPDATER_VENDOR_DIR}`)
}

console.log(`Updater deps staged at ${UPDATER_VENDOR_DIR}`)
