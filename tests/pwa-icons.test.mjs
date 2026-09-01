import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const publicDir = path.join(repoRoot, 'client-ui', 'public')
const iconsDir = path.join(publicDir, 'icons')

function readPngSize(file) {
  const buf = fs.readFileSync(file)
  assert.equal(buf.readUInt32BE(0), 0x89504e47, `not a PNG: ${file}`)
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) }
}

test('PWA / favicon PNGs match declared sizes', () => {
  const expected = [
    ['favicon-16.png', 16],
    ['favicon-32.png', 32],
    ['apple-touch-icon.png', 180],
    ['icon-192.png', 192],
    ['icon-512.png', 512],
    ['icon-512-maskable.png', 512],
  ]
  for (const [name, size] of expected) {
    const file = path.join(iconsDir, name)
    assert.ok(fs.existsSync(file), `missing ${name}`)
    const { width, height } = readPngSize(file)
    assert.equal(width, size, `${name} width`)
    assert.equal(height, size, `${name} height`)
  }
  assert.ok(fs.existsSync(path.join(publicDir, 'favicon.ico')), 'missing favicon.ico')
  assert.ok(!fs.existsSync(path.join(iconsDir, 'logo-192.png')), 'legacy logo-192.png should be removed')
  assert.ok(!fs.existsSync(path.join(iconsDir, 'logo-512.png')), 'legacy logo-512.png should be removed')
})

test('manifest.webmanifest icons point at sized assets', () => {
  const raw = fs.readFileSync(path.join(publicDir, 'manifest.webmanifest'), 'utf8')
  const manifest = JSON.parse(raw)
  assert.ok(Array.isArray(manifest.icons) && manifest.icons.length >= 3)
  assert.ok(manifest.icons.some(i => i.src === '/icons/icon-192.png' && i.sizes === '192x192' && i.purpose === 'any'))
  assert.ok(manifest.icons.some(i => i.src === '/icons/icon-512.png' && i.sizes === '512x512' && i.purpose === 'any'))
  assert.ok(manifest.icons.some(i => i.src === '/icons/icon-512-maskable.png' && i.purpose === 'maskable'))
})
