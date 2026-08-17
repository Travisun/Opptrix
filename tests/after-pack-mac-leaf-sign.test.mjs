/**
 * Unit tests for macOS leaf Mach-O collect (skip symlink + depth-sort)
 * and afterSign Gatekeeper (spctl) contract.
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
  collectSignableLeafMachOs,
  pathSegmentCount,
} = require(path.join(repoRoot, 'apps/desktop/scripts/after-pack-adhoc.cjs'))

describe('collectSignableLeafMachOs', () => {
  it('skips framework tip symlink and depth-sorts Libraries before shallow leaves', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mac-leaf-collect-'))
    try {
      const fw = path.join(tmp, 'Google Chrome for Testing Framework.framework')
      const verDir = path.join(fw, 'Versions', 'A')
      const libDir = path.join(verDir, 'Libraries')
      fs.mkdirSync(libDir, { recursive: true })

      const deepLib = path.join(libDir, 'libEGL.dylib')
      const tipBinary = path.join(verDir, 'Google Chrome for Testing Framework')
      fs.writeFileSync(deepLib, 'dylib')
      // Tip has no known extension — needs Mach-O magic for isMachOCandidate.
      fs.writeFileSync(tipBinary, Buffer.from([0xcf, 0xfa, 0xed, 0xfe]))

      // Framework tip is a symlink (x64 CI hard-fail target) — must not be collected.
      const tipLink = path.join(fw, 'Google Chrome for Testing Framework')
      fs.symlinkSync(
        path.join('Versions', 'A', 'Google Chrome for Testing Framework'),
        tipLink,
      )

      // Second real leaf at shallower depth than Libraries.
      const shallow = path.join(tmp, 'ffmpeg-mac')
      fs.writeFileSync(shallow, 'ffmpeg')

      const leaves = collectSignableLeafMachOs(tmp)
      assert.ok(!leaves.some((p) => p === tipLink), 'must skip tip symlink path')
      assert.ok(
        !leaves.some((p) => fs.lstatSync(p).isSymbolicLink()),
        'collected paths must not be symlinks',
      )

      const realTip = fs.realpathSync(tipLink)
      assert.ok(leaves.includes(fs.realpathSync(deepLib)))
      assert.ok(leaves.includes(realTip))
      assert.ok(leaves.includes(fs.realpathSync(shallow)))

      const idxLib = leaves.indexOf(fs.realpathSync(deepLib))
      const idxTip = leaves.indexOf(realTip)
      assert.ok(idxLib < idxTip, 'Libraries/*.dylib must sort before framework tip binary')
      assert.ok(
        pathSegmentCount(fs.realpathSync(deepLib))
          >= pathSegmentCount(realTip),
      )
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true })
    }
  })

  it('dedupes by realpath when hardlink-equivalent paths resolve to same file', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mac-leaf-dedupe-'))
    try {
      const a = path.join(tmp, 'a')
      fs.mkdirSync(a)
      const real = path.join(a, 'libEGL.dylib')
      fs.writeFileSync(real, 'dylib')
      // Same realpath via .. traversal style path — collect uses realpathSync keys.
      const leaves = collectSignableLeafMachOs(tmp)
      assert.equal(leaves.filter((p) => path.basename(p) === 'libEGL.dylib').length, 1)
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true })
    }
  })
})

describe('afterSign Gatekeeper contract', () => {
  it('after-sign-restore-heavy contains spctl Notarized Developer ID gate', () => {
    const src = fs.readFileSync(
      path.join(repoRoot, 'apps/desktop/scripts/after-sign-restore-heavy.cjs'),
      'utf8',
    )
    assert.match(src, /spctl/)
    assert.match(src, /Notarized Developer ID/)
    assert.match(src, /assertSpctlNotarizedDeveloperId/)
    assert.match(src, /assertPostNotarizeMustVerify/)
    assert.match(src, /assertMustVerifySigned/)
  })
})
