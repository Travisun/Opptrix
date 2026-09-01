/**
 * System font policy — no webfont packages; OS-aware stacks in fontFamily.ts
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const FONTS_CSS = path.join(ROOT, 'client-ui', 'src', 'styles', 'fonts.css')
const FONT_FAMILY_TS = path.join(ROOT, 'client-ui', 'src', 'theme', 'fontFamily.ts')

test('fonts.css has system stacks only (no @fontsource)', () => {
  assert.ok(fs.existsSync(FONTS_CSS))
  const css = fs.readFileSync(FONTS_CSS, 'utf8')
  assert.match(css, /--opptrix-font-sans/)
  assert.match(css, /--opptrix-font-mono/)
  assert.ok(!css.includes('@fontsource'))
  assert.ok(!css.includes('source-han-alias'))
  assert.ok(!css.includes('@import'))
})

test('fontFamily.ts exports OS-aware presets', () => {
  const src = fs.readFileSync(FONT_FAMILY_TS, 'utf8')
  assert.match(src, /export type FontFamilyPreset = 'system' \| 'hei' \| 'song'/)
  assert.match(src, /detectFontUiPlatform/)
  assert.match(src, /PingFang SC/)
  assert.match(src, /Microsoft YaHei/)
  assert.match(src, /Noto Sans CJK SC/)
  assert.match(src, /LEGACY_PRESET_MAP/)
  assert.match(src, /inter:\s*'system'/)
})

test('package wiring has no prepare:fonts / @fontsource', () => {
  const clientPkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'client-ui', 'package.json'), 'utf8'))
  const rootPkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'))
  assert.equal(clientPkg.scripts?.prebuild, undefined)
  assert.equal(rootPkg.scripts?.['prepare:fonts'], undefined)
  assert.ok(!String(rootPkg.scripts?.build ?? '').includes('prepare:fonts'))
  for (const dep of ['@fontsource/inter', '@fontsource/jetbrains-mono', '@fontsource/noto-sans-sc']) {
    assert.equal(clientPkg.dependencies?.[dep], undefined)
  }
  assert.ok(!fs.existsSync(path.join(ROOT, 'scripts', 'prepare-ui-fonts.mjs')))
  assert.ok(!fs.existsSync(path.join(ROOT, 'scripts', 'generate-source-han-alias.mjs')))
})
