#!/usr/bin/env node
/** Ensure Electron postinstall downloaded dist/ (common when npm install skipped postinstall). */
import { createRequire } from 'node:module'
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DESKTOP_ROOT = path.resolve(__dirname, '..')
const REPO_ROOT = path.resolve(__dirname, '../../..')
/** Prefer workspace install (`apps/desktop/node_modules`); fall back to repo-root hoist. */
const requireDesktop = createRequire(path.join(DESKTOP_ROOT, 'package.json'))
const requireRoot = createRequire(path.join(REPO_ROOT, 'package.json'))

function electronPkgDir() {
  try {
    return path.dirname(requireDesktop.resolve('electron/package.json'))
  } catch {
    return path.dirname(requireRoot.resolve('electron/package.json'))
  }
}

function requireElectron() {
  try {
    return requireDesktop('electron')
  } catch {
    return requireRoot('electron')
  }
}

export function isElectronInstalled() {
  const dir = electronPkgDir()
  const pathFile = path.join(dir, 'path.txt')
  if (!fs.existsSync(pathFile)) return false
  try {
    const rel = fs.readFileSync(pathFile, 'utf8').trim()
    return fs.existsSync(path.join(dir, 'dist', rel))
  } catch {
    return false
  }
}

export function ensureElectronInstalled() {
  if (isElectronInstalled()) return electronPkgDir()
  const dir = electronPkgDir()
  console.log('[desktop] Electron binary missing — running postinstall download…')
  const r = spawnSync(process.execPath, [path.join(dir, 'install.js')], {
    cwd: dir,
    stdio: 'inherit',
    shell: false,
  })
  if (r.status !== 0 || !isElectronInstalled()) {
    throw new Error(
      'Electron failed to install. Try:\n' +
      '  rm -rf node_modules/electron && npm install -w @opptrix/desktop',
    )
  }
  return dir
}

export function resolveElectronExecutable() {
  ensureElectronInstalled()
  return requireElectron()
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  ensureElectronInstalled()
  console.log('[desktop] Electron OK:', resolveElectronExecutable())
}
