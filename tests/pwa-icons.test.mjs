import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const publicDir = path.join(repoRoot, 'client-ui', 'public')
const iconsDir = path.join(publicDir, 'icons')
const screenshotsDir = path.join(publicDir, 'screenshots')
const indexHtml = path.join(repoRoot, 'client-ui', 'index.html')

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
  const rootApple = path.join(publicDir, 'apple-touch-icon.png')
  assert.ok(fs.existsSync(rootApple), 'missing root apple-touch-icon.png')
  const rootSize = readPngSize(rootApple)
  assert.equal(rootSize.width, 180)
  assert.equal(rootSize.height, 180)
  assert.ok(fs.existsSync(path.join(publicDir, 'favicon.ico')), 'missing favicon.ico')
  assert.ok(!fs.existsSync(path.join(iconsDir, 'logo-192.png')), 'legacy logo-192.png should be removed')
  assert.ok(!fs.existsSync(path.join(iconsDir, 'logo-512.png')), 'legacy logo-512.png should be removed')
})

test('PWA install screenshots exist with Chrome form factors', () => {
  const narrow = path.join(screenshotsDir, 'narrow.png')
  const wide = path.join(screenshotsDir, 'wide.png')
  assert.ok(fs.existsSync(narrow), 'missing screenshots/narrow.png')
  assert.ok(fs.existsSync(wide), 'missing screenshots/wide.png')
  const n = readPngSize(narrow)
  const w = readPngSize(wide)
  assert.equal(n.width, 1080)
  assert.equal(n.height, 1920)
  assert.equal(w.width, 1920)
  assert.equal(w.height, 1080)
})

test('manifest.webmanifest meets Chrome installability fields', () => {
  const raw = fs.readFileSync(path.join(publicDir, 'manifest.webmanifest'), 'utf8')
  const manifest = JSON.parse(raw)
  assert.equal(manifest.id, '/')
  assert.ok(manifest.name)
  assert.ok(manifest.short_name)
  assert.ok(manifest.description)
  assert.equal(manifest.display, 'standalone')
  assert.equal(manifest.prefer_related_applications, false)
  assert.ok(Array.isArray(manifest.categories) && manifest.categories.length > 0)
  assert.ok(Array.isArray(manifest.icons) && manifest.icons.length >= 3)
  assert.ok(manifest.icons.some(i => i.src === '/icons/icon-192.png' && i.sizes === '192x192' && i.purpose === 'any'))
  assert.ok(manifest.icons.some(i => i.src === '/icons/icon-512.png' && i.sizes === '512x512' && i.purpose === 'any'))
  assert.ok(manifest.icons.some(i => i.src === '/icons/icon-512-maskable.png' && i.purpose === 'maskable'))
  assert.ok(Array.isArray(manifest.screenshots) && manifest.screenshots.length >= 2)
  assert.ok(manifest.screenshots.some(s => s.form_factor === 'narrow' && s.src === '/screenshots/narrow.png'))
  assert.ok(manifest.screenshots.some(s => s.form_factor === 'wide' && s.src === '/screenshots/wide.png'))
})

test('index.html declares Apple title, description, and touch icons', () => {
  const html = fs.readFileSync(indexHtml, 'utf8')
  assert.match(html, /name="description"[^>]*content="Opptrix 投研工作台"/)
  assert.match(html, /name="apple-mobile-web-app-title"[^>]*content="Opptrix"/)
  assert.match(html, /rel="apple-touch-icon"[^>]*href="\/apple-touch-icon\.png"/)
  assert.match(html, /rel="apple-touch-icon"[^>]*href="\/icons\/apple-touch-icon\.png"/)
  assert.match(html, /rel="manifest"[^>]*href="\/manifest\.webmanifest"/)
})
