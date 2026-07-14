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

/** Apple iconset naming — used by iconutil for .icns (Dock / Finder / About). */
const MAC_ICONSET_ENTRIES = [
  { file: 'icon_16x16.png', source: 'logo@16.png' },
  { file: 'icon_16x16@2x.png', source: 'logo@32.png' },
  { file: 'icon_32x32.png', source: 'logo@32.png' },
  { file: 'icon_32x32@2x.png', source: 'logo@64.png' },
  { file: 'icon_128x128.png', source: 'logo@128.png' },
  { file: 'icon_128x128@2x.png', source: 'logo@256.png' },
  { file: 'icon_256x256.png', source: 'logo@256.png' },
  { file: 'icon_256x256@2x.png', source: 'logo@512.png' },
  { file: 'icon_512x512.png', source: 'logo@512.png' },
  { file: 'icon_512x512@2x.png', source: 'logo.png' },
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

async function createWindowsIco() {
  const { default: pngToIco } = await import('png-to-ico')
  const sizes = [
    { size: 16, source: 'logo@16.png' },
    { size: 32, source: 'logo@32.png' },
    { size: 48, source: 'logo@64.png' },
    { size: 256, source: 'logo@256.png' },
  ]
  const paths = []
  let tmp48 = null
  try {
    for (const { size, source } of sizes) {
      const src = path.join(SOURCE_DIR, source)
      if (!fs.existsSync(src)) {
        throw new Error(`Missing Windows icon source: ${src}`)
      }
      if (size === 48 && process.platform === 'darwin') {
        tmp48 = path.join(OUT_DIR, '.tmp-48.png')
        resizePng(src, tmp48, 48)
        paths.push(tmp48)
      } else {
        paths.push(src)
      }
    }
    const ico = await pngToIco(paths)
    fs.writeFileSync(path.join(OUT_DIR, 'icon.ico'), ico)
  } finally {
    if (tmp48) fs.rmSync(tmp48, { force: true })
  }
}

function createMacIcns() {
  if (process.platform !== 'darwin') {
    console.log('Skipping .icns generation (iconutil requires macOS); electron-builder will convert PNG on Mac CI.')
    return
  }

  const iconsetDir = path.join(OUT_DIR, 'icon.iconset')
  fs.rmSync(iconsetDir, { recursive: true, force: true })
  fs.mkdirSync(iconsetDir, { recursive: true })

  for (const entry of MAC_ICONSET_ENTRIES) {
    const src = path.join(SOURCE_DIR, entry.source)
    if (!fs.existsSync(src)) {
      throw new Error(`Missing macOS icon source: ${src}`)
    }
    copyFile(src, path.join(iconsetDir, entry.file))
  }

  const icnsPath = path.join(OUT_DIR, 'icon.icns')
  fs.rmSync(icnsPath, { force: true })
  const result = spawnSync('iconutil', ['-c', 'icns', iconsetDir, '-o', icnsPath], {
    stdio: 'pipe',
    encoding: 'utf8',
  })
  fs.rmSync(iconsetDir, { recursive: true, force: true })
  if (result.status !== 0) {
    throw new Error(`iconutil failed: ${result.stderr || result.stdout || 'unknown error'}`)
  }
}

assertSource()
fs.rmSync(OUT_DIR, { recursive: true, force: true })
fs.mkdirSync(OUT_DIR, { recursive: true })
const masterIcon = path.join(SOURCE_DIR, 'logo.png')
copyFile(masterIcon, path.join(OUT_DIR, 'logo.png'))
createAppIcon(masterIcon, path.join(OUT_DIR, 'logo-app.png'))
createMacIcns()
copyFile(path.join(OUT_DIR, 'logo-app.png'), path.join(DESKTOP_ROOT, 'electron', 'about-logo.png'))
copyFile(path.join(SOURCE_DIR, 'logo@128.png'), path.join(DESKTOP_ROOT, 'electron', 'splash-logo.png'))
stageLinuxIcons()
await createWindowsIco()
console.log(`Desktop icons staged at ${OUT_DIR}`)

