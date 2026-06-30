#!/usr/bin/env node
/** Stage repo icons/ into apps/desktop/build/icons for Electron runtime + electron-builder. */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { REPO_ROOT } from './lib/paths.mjs'

const DESKTOP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SOURCE_DIR = path.join(REPO_ROOT, 'icons')
const OUT_DIR = path.join(DESKTOP_ROOT, 'build', 'icons')
const LINUX_DIR = path.join(OUT_DIR, 'linux')

const LINUX_SIZES = [
  { size: 16, source: 'logo@16.png' },
  { size: 32, source: 'logo@32.png' },
  { size: 48, source: 'logo@64.png', resize: true },
  { size: 64, source: 'logo@64.png' },
  { size: 128, source: 'logo@128.png' },
  { size: 256, source: 'logo@256.png' },
  { size: 512, source: 'logo@512.png' },
]

function assertSource() {
  const master = path.join(SOURCE_DIR, 'logo.png')
  if (!fs.existsSync(master)) {
    throw new Error(`Missing app icon source: ${master}`)
  }
}

function copyFile(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  fs.copyFileSync(src, dest)
}

function resizePng(src, dest, size) {
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  const result = spawnSync('sips', ['-z', String(size), String(size), src, '--out', dest], {
    stdio: 'pipe',
    encoding: 'utf8',
  })
  if (result.status !== 0) {
    throw new Error(
      `Failed to resize ${src} to ${size}x${size}: ${result.stderr || result.stdout || 'sips error'}`,
    )
  }
}

/** Packaged / dock icon — keep source alpha (no solid pad). */
function createAppIcon(master, dest) {
  copyFile(master, dest)
}

function writeLinuxIcon({ size, source, resize = false }) {
  const src = path.join(SOURCE_DIR, source)
  const dest = path.join(LINUX_DIR, `${size}x${size}.png`)
  if (!fs.existsSync(src)) {
    throw new Error(`Missing Linux icon source: ${src}`)
  }
  if (resize && process.platform === 'darwin') {
    resizePng(src, dest, size)
    return
  }
  copyFile(src, dest)
}

function stageLinuxIcons() {
  fs.mkdirSync(LINUX_DIR, { recursive: true })
  for (const entry of LINUX_SIZES) {
    writeLinuxIcon(entry)
  }
}

assertSource()
fs.rmSync(OUT_DIR, { recursive: true, force: true })
fs.mkdirSync(OUT_DIR, { recursive: true })
const masterIcon = path.join(SOURCE_DIR, 'logo.png')
copyFile(masterIcon, path.join(OUT_DIR, 'logo.png'))
createAppIcon(masterIcon, path.join(OUT_DIR, 'logo-app.png'))
copyFile(path.join(OUT_DIR, 'logo-app.png'), path.join(DESKTOP_ROOT, 'electron', 'about-logo.png'))
copyFile(path.join(SOURCE_DIR, 'logo@128.png'), path.join(DESKTOP_ROOT, 'electron', 'splash-logo.png'))
stageLinuxIcons()
console.log(`Desktop icons staged at ${OUT_DIR}`)
