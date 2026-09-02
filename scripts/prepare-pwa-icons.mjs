#!/usr/bin/env node
/**
 * Sync favicon + PWA install icons from icons/ into client-ui/public.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SOURCE_DIR = path.join(REPO_ROOT, 'icons')

function copyFile(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  fs.copyFileSync(src, dest)
}

function assertPngSize(file, size) {
  const buf = fs.readFileSync(file)
  if (buf.length < 24 || buf.readUInt32BE(0) !== 0x89504e47) {
    throw new Error(`Not a PNG: ${file}`)
  }
  const width = buf.readUInt32BE(16)
  const height = buf.readUInt32BE(20)
  if (width !== size || height !== size) {
    throw new Error(`${file} must be ${size}x${size}, got ${width}x${height}`)
  }
}

async function resizePngSharp(src, dest, size) {
  const { default: sharp } = await import('sharp')
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  await sharp(src)
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(dest)
}

async function stageWebPwaIcons() {
  const publicDir = path.join(REPO_ROOT, 'client-ui', 'public')
  const iconsDir = path.join(publicDir, 'icons')
  fs.mkdirSync(iconsDir, { recursive: true })

  const master = path.join(SOURCE_DIR, 'logo.png')
  const logo16 = path.join(SOURCE_DIR, 'logo@16.png')
  const logo32 = path.join(SOURCE_DIR, 'logo@32.png')
  const logo512 = path.join(SOURCE_DIR, 'logo@512.png')
  for (const file of [master, logo16, logo32, logo512]) {
    if (!fs.existsSync(file)) throw new Error(`Missing Web icon source: ${file}`)
  }

  const favicon16 = path.join(iconsDir, 'favicon-16.png')
  const favicon32 = path.join(iconsDir, 'favicon-32.png')
  const appleTouch = path.join(iconsDir, 'apple-touch-icon.png')
  const appleTouchRoot = path.join(publicDir, 'apple-touch-icon.png')
  const icon192 = path.join(iconsDir, 'icon-192.png')
  const icon512 = path.join(iconsDir, 'icon-512.png')
  const icon512Maskable = path.join(iconsDir, 'icon-512-maskable.png')
  const faviconIco = path.join(publicDir, 'favicon.ico')

  copyFile(logo16, favicon16)
  copyFile(logo32, favicon32)
  assertPngSize(favicon16, 16)
  assertPngSize(favicon32, 32)

  await resizePngSharp(master, appleTouch, 180)
  copyFile(appleTouch, appleTouchRoot)
  await resizePngSharp(master, icon192, 192)
  copyFile(logo512, icon512)
  assertPngSize(appleTouch, 180)
  assertPngSize(icon192, 192)
  assertPngSize(icon512, 512)

  {
    const { default: sharp } = await import('sharp')
    const canvas = 512
    const inner = Math.round(canvas * 0.8)
    const pad = Math.floor((canvas - inner) / 2)
    const fg = await sharp(master)
      .resize(inner, inner, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer()
    await sharp({
      create: {
        width: canvas,
        height: canvas,
        channels: 4,
        background: { r: 245, g: 245, b: 247, alpha: 1 },
      },
    })
      .composite([{ input: fg, left: pad, top: pad }])
      .png()
      .toFile(icon512Maskable)
    assertPngSize(icon512Maskable, 512)
  }

  const { default: pngToIco } = await import('png-to-ico')
  const ico = await pngToIco([favicon16, favicon32])
  fs.writeFileSync(faviconIco, ico)

  copyFile(path.join(SOURCE_DIR, 'logo@64.png'), path.join(publicDir, 'app-icon.png'))

  for (const legacy of ['logo-192.png', 'logo-512.png']) {
    fs.rmSync(path.join(iconsDir, legacy), { force: true })
  }
}

await stageWebPwaIcons()
console.log('PWA icons synced to client-ui/public')
