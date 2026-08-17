/**
 * Unit tests for mac-sign-checklist load / glob resolve (no codesign).
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const {
  MAC_SIGN_CHECKLIST_PATH,
  loadMacSignChecklist,
  resolveMustVerify,
  matchGlob,
  assertMustVerifySigned,
} = require(path.join(repoRoot, 'apps/desktop/scripts/lib/mac-sign-checklist.cjs'))

describe('mac-sign-checklist lib', () => {
  it('loads checklist from resources and exports absolute path', () => {
    assert.ok(fs.existsSync(MAC_SIGN_CHECKLIST_PATH))
    assert.ok(MAC_SIGN_CHECKLIST_PATH.endsWith(`${path.sep}mac-sign-checklist.json`))
    const checklist = loadMacSignChecklist()
    assert.equal(checklist.version, 1)
    assert.ok(checklist.mustVerify.some((e) => e.id === 'cft-libEGL'))
  })

  it('matchGlob supports ** and single-segment *', () => {
    assert.equal(
      matchGlob(
        'runtime-stage/playwright-browsers/**/Libraries/libEGL.dylib',
        'runtime-stage/playwright-browsers/chromium-1234/chrome-mac-arm64/X.app/Contents/Frameworks/F.framework/Versions/1/Libraries/libEGL.dylib',
      ),
      true,
    )
    assert.equal(
      matchGlob('a/*/c', 'a/b/c'),
      true,
    )
    assert.equal(
      matchGlob('a/*/c', 'a/b/x/c'),
      false,
    )
  })

  it('resolveMustVerify expands fixtures and throws on required zero hits', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mac-sign-cl-'))
    try {
      const libDir = path.join(
        tmp,
        'runtime-stage/playwright-browsers/chromium-x/chrome-mac-arm64',
        'Google Chrome for Testing.app/Contents/Frameworks',
        'Google Chrome for Testing Framework.framework/Versions/1/Libraries',
      )
      fs.mkdirSync(libDir, { recursive: true })
      for (const name of ['libEGL.dylib', 'libGLESv2.dylib', 'libvk_swiftshader.dylib']) {
        fs.writeFileSync(path.join(libDir, name), '')
      }
      const helpers = path.join(
        tmp,
        'runtime-stage/playwright-browsers/chromium-x/chrome-mac-arm64',
        'Google Chrome for Testing.app/Contents/Frameworks',
        'Google Chrome for Testing Framework.framework/Versions/1/Helpers',
      )
      fs.mkdirSync(helpers, { recursive: true })
      fs.writeFileSync(path.join(helpers, 'chrome_crashpad_handler'), '')
      fs.mkdirSync(path.join(tmp, 'runtime-stage/playwright-browsers/ffmpeg-1011'), {
        recursive: true,
      })
      fs.writeFileSync(
        path.join(tmp, 'runtime-stage/playwright-browsers/ffmpeg-1011/ffmpeg-mac'),
        '',
      )
      // Framework bundle path itself
      const fw = path.join(
        tmp,
        'runtime-stage/playwright-browsers/chromium-x/chrome-mac-arm64',
        'Google Chrome for Testing.app/Contents/Frameworks',
        'Google Chrome for Testing Framework.framework',
      )
      assert.ok(fs.existsSync(fw))

      const checklist = loadMacSignChecklist()
      const resolved = resolveMustVerify(tmp, checklist)
      const byId = Object.fromEntries(resolved.map((r) => [r.id, r]))
      assert.equal(byId['cft-libEGL'].paths.length, 1)
      assert.equal(byId['cft-libGLESv2'].paths.length, 1)
      assert.equal(byId['cft-libvk_swiftshader'].paths.length, 1)
      assert.ok(byId['cft-chrome-app'].paths.length >= 1)
      assert.equal(byId['cft-crashpad'].paths.length, 1)
      assert.equal(byId['cft-ffmpeg-mac'].paths.length, 1)
      assert.ok(byId['cft-chrome-framework'].paths.length >= 1)

      assert.throws(
        () => resolveMustVerify(path.join(tmp, 'empty-missing'), checklist),
        /matched 0 paths/,
      )

      const seen = []
      assertMustVerifySigned(tmp, checklist, (p) => {
        seen.push(p)
      })
      assert.ok(seen.length >= 7)
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true })
    }
  })
})
