/**
 * UI token discipline (Phase B design-token architecture).
 *
 * Two enforcement zones:
 *   1. ZERO TOLERANCE — `client-ui/src/ui-kit/` (the extension-facing
 *      component contract) must contain no raw hex colors and no raw px
 *      font sizes. All values flow through theme tokens.
 *   2. RATCHET — the rest of client-ui/src (excluding the theme definition
 *      files where primitives live) must never GROW its raw hex / raw px
 *      font-size counts. New code uses tokens; legacy violations shrink over
 *      time. Baseline lives in tests/fixtures/ui-token-baseline.json and may
 *      only be lowered.
 *
 * Baseline refresh: run the scan manually, lower the JSON, commit.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const srcRoot = path.join(here, '../client-ui/src')
const baselineFile = path.join(here, 'fixtures/ui-token-baseline.json')

const THEME_DEF_FILES = new Set([
  'theme/tokens.ts',
  'theme/opptrixTheme.ts',
  'theme/cssVars.ts',
  'theme/markdownTokens.ts',
  'theme/fontScale.ts',
  'theme/design-tokens.ts',
])

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '__tests__') continue
      walk(full, out)
    } else if (/\.(tsx|ts)$/.test(entry.name) && !/\.test\./.test(entry.name)) {
      out.push(full)
    }
  }
  return out
}

function isThemeDef(file) {
  const rel = path.relative(srcRoot, file).split(path.sep).join('/')
  return THEME_DEF_FILES.has(rel)
}

function scan(file) {
  const src = fs.readFileSync(file, 'utf8')
  const hex = (src.match(/#[0-9a-fA-F]{6}\b/g) ?? []).length
  const pxFont = (src.match(/fontSize:\s*'?\d+/g) ?? []).length
  return { hex, pxFont }
}

function totals(files) {
  let hex = 0
  let pxFont = 0
  for (const f of files) {
    const s = scan(f)
    hex += s.hex
    pxFont += s.pxFont
  }
  return { hex, pxFont }
}

describe('UI token discipline', () => {
  const allFiles = walk(srcRoot)
  const nonTheme = allFiles.filter((f) => !isThemeDef(f))
  const uiKit = nonTheme.filter((f) => path.relative(srcRoot, f).split(path.sep).join('/').startsWith('ui-kit/'))

  it('ui-kit zone: zero raw hex, zero raw px font sizes', () => {
    const t = totals(uiKit)
    assert.equal(t.hex, 0, `ui-kit raw hex count must be 0, got ${t.hex}`)
    assert.equal(t.pxFont, 0, `ui-kit raw px font sizes must be 0, got ${t.pxFont}`)
  })

  it('ratchet: raw hex / px font counts never grow past baseline', () => {
    const baseline = JSON.parse(fs.readFileSync(baselineFile, 'utf8'))
    const t = totals(nonTheme)
    assert.ok(
      t.hex <= baseline.maxRawHex,
      `raw hex ${t.hex} exceeds baseline ${baseline.maxRawHex} — use opptrixCssVars/designTokens; if violations were REMOVED, lower the baseline`,
    )
    assert.ok(
      t.pxFont <= baseline.maxRawPxFont,
      `raw px font sizes ${t.pxFont} exceed baseline ${baseline.maxRawPxFont} — use FONT_SCALES/opptrixCssVars; if violations were REMOVED, lower the baseline`,
    )
  })

  it('ui-kit surface exports the documented contract', async () => {
    // ui-kit is client TS — verify statically (no runtime bundler in tests).
    const src = fs.readFileSync(path.join(srcRoot, 'ui-kit/index.ts'), 'utf8')
    const requiredExports = [
      'Button', 'Input', 'Textarea', 'Select', 'Field', 'InlineEdit',
      'SegmentedControl', 'Spinner', 'Surface', 'DialogAlert', 'DropdownPanel',
      'SettingsGroup', 'SettingsCard', 'SettingsSectionHeader', 'SettingsSectionLabel',
      'SettingsEmptyState', 'SettingsRow', 'SettingsStaticBlock',
      'opptrixCssVars', 'FONT_SCALES', 'designTokens', 'SPACING', 'RADIUS',
      'Z', 'MOTION', 'CONTROL', 'semantic', 'designTokenCssVars',
      'useSettingsToast',
    ]
    for (const name of requiredExports) {
      assert.ok(
        new RegExp(`export \\{[^}]*\\b${name}\\b[^}]*\\}`).test(src) ||
          new RegExp(`export \\{ default as ${name}\\b`).test(src),
        `ui-kit must export ${name}`,
      )
    }
    // The re-export targets must exist on disk.
    for (const rel of [
      'components/opptrix/OpptrixButton.tsx',
      'components/opptrix/OpptrixInput.tsx',
      'components/opptrix/OpptrixSpinner.tsx',
      'components/opptrix/OpptrixSurface.tsx',
      'pages/settings/SettingsPrimitives.tsx',
      'pages/settings/SettingsToast.tsx',
      'theme/design-tokens.ts',
    ]) {
      assert.ok(fs.existsSync(path.join(srcRoot, rel)), `ui-kit dependency missing: ${rel}`)
    }
  })
})
