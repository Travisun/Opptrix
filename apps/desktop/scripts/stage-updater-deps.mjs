#!/usr/bin/env node
/** Stage electron-updater + runtime deps for the packaged Electron main process. */
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DESKTOP_ROOT = path.resolve(__dirname, '..')
const REPO_ROOT = path.resolve(DESKTOP_ROOT, '../..')
const DEST = path.join(DESKTOP_ROOT, 'build/updater-deps/node_modules')
const require = createRequire(path.join(DESKTOP_ROOT, 'package.json'))

function rm(dir) {
  fs.rmSync(dir, { recursive: true, force: true })
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

  const pkgJson = JSON.parse(fs.readFileSync(path.join(pkgDir, 'package.json'), 'utf8'))
  for (const dep of Object.keys(pkgJson.dependencies ?? {})) {
    copyPackage(dep, copied)
  }

  fs.cpSync(pkgDir, path.join(DEST, name), { recursive: true })
}

rm(DEST)
fs.mkdirSync(DEST, { recursive: true })
copyPackage('electron-updater', new Set())
console.log(`Updater deps staged at ${DEST}`)
