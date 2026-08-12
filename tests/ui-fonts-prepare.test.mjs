/**
 * UI fonts prepare — asserts @fontsource packages + Source Han alias generation.
 *
 * Does not run full vite build (too heavy for unit suite).
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import {
  assertFontsourcePackages,
  assertSourceHanAlias,
  prepareUiFonts,
  resolveFontsourcePkgDir,
} from '../scripts/prepare-ui-fonts.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const ALIAS = path.join(ROOT, 'client-ui', 'src', 'styles', 'source-han-alias.css')
const FONTS_CSS = path.join(ROOT, 'client-ui', 'src', 'styles', 'fonts.css')
const LICENSE = path.join(ROOT, 'client-ui', 'public', 'fonts', 'LICENSE')

test('resolveFontsourcePkgDir finds noto-sans-sc / inter / jetbrains-mono', () => {
  for (const pkg of [
    '@fontsource/noto-sans-sc',
    '@fontsource/inter',
    '@fontsource/jetbrains-mono',
  ]) {
    const dir = resolveFontsourcePkgDir(pkg)
    assert.ok(dir, `expected ${pkg} under node_modules`)
    assert.ok(fs.existsSync(dir), dir)
  }
})

test('assertFontsourcePackages can read weight CSS (400/500/700)', () => {
  const resolved = assertFontsourcePackages()
  assert.equal(resolved.size, 3)
})

test('prepareUiFonts writes valid source-han-alias.css', () => {
  const { dest, bytes } = prepareUiFonts()
  assert.equal(dest, ALIAS)
  assert.ok(bytes > 1000, `alias too small: ${bytes}`)
  assertSourceHanAlias(ALIAS)
  const css = fs.readFileSync(ALIAS, 'utf8')
  assert.match(css, /Source Han Sans SC/)
  assert.match(css, /url\(@fontsource\/noto-sans-sc\/files\//)
  assert.ok(!css.includes("font-family: 'Noto Sans SC';"), 'alias must rename family to Source Han')
})

test('npm run prepare:fonts exits 0', () => {
  const r = spawnSync('npm', ['run', 'prepare:fonts'], {
    cwd: ROOT,
    encoding: 'utf8',
    shell: process.platform === 'win32',
  })
  assert.equal(r.status, 0, r.stderr || r.stdout)
})

test('fonts.css + LICENSE are committed sources; alias is generated', () => {
  assert.ok(fs.existsSync(FONTS_CSS), 'fonts.css must exist')
  assert.ok(fs.existsSync(LICENSE), 'public/fonts/LICENSE must exist')
  const fontsCss = fs.readFileSync(FONTS_CSS, 'utf8')
  assert.match(fontsCss, /source-han-alias\.css/)
  assert.match(fontsCss, /@fontsource\/noto-sans-sc/)
})

test('client-ui package.json prebuild / root prepare:fonts wired', () => {
  const clientPkg = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'client-ui', 'package.json'), 'utf8'),
  )
  const rootPkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'))
  assert.match(String(clientPkg.scripts?.prebuild ?? ''), /prepare-ui-fonts/)
  assert.equal(rootPkg.scripts?.['prepare:fonts'], 'node scripts/prepare-ui-fonts.mjs')
  assert.match(String(rootPkg.scripts?.build ?? ''), /prepare:fonts/)
})

test('gitignore ignores generated source-han-alias.css', () => {
  const gi = fs.readFileSync(path.join(ROOT, '.gitignore'), 'utf8')
  assert.match(gi, /source-han-alias\.css/)
})
