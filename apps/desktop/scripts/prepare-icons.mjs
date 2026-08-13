#!/usr/bin/env node
/**
 * Stage repo icons/ into apps/desktop/build/icons for Electron runtime + electron-builder.
 *
 * NSIS installer/uninstaller icons use hand-aligned PNGs in icons/nsis/
 * (installer-{16,32,48,256}.png) — not logo@* or @2x/@3x variants.
 */
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
  const iconComposer = path.join(SOURCE_DIR, 'opptrix.icon')
  if (!fs.existsSync(iconComposer) || !fs.statSync(iconComposer).isDirectory()) {
    throw new Error(`Missing Icon Composer package: ${iconComposer}`)
  }
  const iconJson = path.join(iconComposer, 'icon.json')
  if (!fs.existsSync(iconJson)) {
    throw new Error(`Missing icon.json in Icon Composer package: ${iconJson}`)
  }
}

function stageIconComposerPackage() {
  const src = path.join(SOURCE_DIR, 'opptrix.icon')
  const dest = path.join(OUT_DIR, 'icon.icon')
  fs.cpSync(src, dest, { recursive: true })
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

const TRAY_MAC_REQUIRED = ['trayTemplate.png', 'trayTemplate@2x.png', 'trayTemplate@3x.png']
const TRAY_COLOR_ENTRIES = [
  { name: 'tray-color.png', size: 16 },
  { name: 'tray-color@1.25x.png', size: 20 },
  { name: 'tray-color@1.5x.png', size: 24 },
  { name: 'tray-color@2x.png', size: 32 },
]

function readPngDimensions(file) {
  const buf = fs.readFileSync(file)
  if (buf.length < 24 || buf.readUInt32BE(0) !== 0x89504e47) {
    throw new Error(`Not a PNG: ${file}`)
  }
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) }
}

/** Menu-bar / notification-area tray glyphs (mac Template + Win/Linux color + Win ICO). */
async function stageTrayIcons() {
  const src = path.join(SOURCE_DIR, 'tray')
  const dest = path.join(OUT_DIR, 'tray')
  if (!fs.existsSync(src)) {
    console.warn(`Missing tray icons dir: ${src} (tray will fall back to app logo)`)
    return
  }
  for (const name of TRAY_MAC_REQUIRED) {
    const file = path.join(src, name)
    if (!fs.existsSync(file)) {
      throw new Error(`Missing tray icon: ${file}`)
    }
  }
  const trayColorPaths = []
  for (const { name, size } of TRAY_COLOR_ENTRIES) {
    const file = path.join(src, name)
    if (!fs.existsSync(file)) {
      throw new Error(`Missing tray icon: ${file}`)
    }
    const { width, height } = readPngDimensions(file)
    if (width !== size || height !== size) {
      throw new Error(`Tray icon ${name} must be ${size}x${size}, got ${width}x${height}`)
    }
    trayColorPaths.push(file)
  }
  fs.cpSync(src, dest, { recursive: true })
  const { default: pngToIco } = await import('png-to-ico')
  const ico = await pngToIco(trayColorPaths)
  fs.writeFileSync(path.join(dest, 'tray.ico'), ico)
  fs.writeFileSync(path.join(src, 'tray.ico'), ico)
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

/** NSIS installer / uninstaller — hand-aligned icons/nsis/installer-{16,32,48,256}.png */
const NSIS_INSTALLER_PNGS = [
  { size: 16, file: 'installer-16.png' },
  { size: 32, file: 'installer-32.png' },
  { size: 48, file: 'installer-48.png' },
  { size: 256, file: 'installer-256.png' },
]

async function createNsisIcons() {
  const { default: pngToIco } = await import('png-to-ico')
  const nsisSrc = path.join(SOURCE_DIR, 'nsis')
  const paths = []
  for (const { size, file } of NSIS_INSTALLER_PNGS) {
    const src = path.join(nsisSrc, file)
    if (!fs.existsSync(src)) {
      throw new Error(`Missing NSIS installer icon source: ${src}`)
    }
    const { width, height } = readPngDimensions(src)
    if (width !== size || height !== size) {
      throw new Error(`NSIS icon ${file} must be ${size}x${size}, got ${width}x${height}`)
    }
    paths.push(src)
  }
  const ico = await pngToIco(paths)
  fs.writeFileSync(path.join(OUT_DIR, 'installerIcon.ico'), ico)
  fs.writeFileSync(path.join(OUT_DIR, 'uninstallerIcon.ico'), ico)
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
stageIconComposerPackage()
createMacIcns()
copyFile(path.join(OUT_DIR, 'logo-app.png'), path.join(DESKTOP_ROOT, 'electron', 'about-logo.png'))
copyFile(path.join(SOURCE_DIR, 'logo@128.png'), path.join(DESKTOP_ROOT, 'electron', 'splash-logo.png'))
// Win/Linux frame titlebar + any static /app-icon.png consumers — keep in sync with logo@64.
copyFile(
  path.join(SOURCE_DIR, 'logo@64.png'),
  path.join(REPO_ROOT, 'client-ui', 'public', 'app-icon.png'),
)
stageLinuxIcons()
await stageTrayIcons()
await createWindowsIco()
await createNsisIcons()
console.log(`Desktop icons staged at ${OUT_DIR}`)
console.log('  staged: icon.icon (mac App / Icon Composer)')
console.log('  staged: icon.icns (DMG + Dock fallback)')
console.log('  staged: tray/ (mac Template + Win tray.ico + Linux color PNG)')
console.log('  staged: installerIcon.ico + uninstallerIcon.ico (NSIS ← icons/nsis/)')
console.log('  synced: client-ui/public/app-icon.png ← logo@64.png')

