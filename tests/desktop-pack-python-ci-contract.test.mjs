/**
 * Contract: CI / release / prebuild / audit / verify-packaged-runtime stay aligned
 * on staged Python + ffmpeg executable checks.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function read(rel) {
  return fs.readFileSync(path.join(repoRoot, rel), 'utf8')
}

describe('desktop pack python / ffmpeg CI contract', () => {
  it('prebuild runs stage-python before audit-desktop-pack', () => {
    const src = read('apps/desktop/scripts/prebuild.mjs')
    const py = src.indexOf('stage-python.mjs')
    const audit = src.indexOf('audit-desktop-pack.mjs')
    assert.ok(py >= 0, 'prebuild must invoke stage-python.mjs')
    assert.ok(audit >= 0, 'prebuild must invoke audit-desktop-pack.mjs')
    assert.ok(py < audit, 'stage-python must run before audit')
    assert.ok(src.includes('OPPTRIX_AUDIT_REQUIRE_STAGED_PYTHON'))
  })

  it('audit requires stage-python in prebuild order and workflows', () => {
    const src = read('apps/desktop/scripts/audit-desktop-pack.mjs')
    assert.ok(src.includes("'stage-python.mjs'"))
    assert.ok(src.includes('OPPTRIX_AUDIT_REQUIRE_STAGED_PYTHON'))
    assert.ok(src.includes('stage-python.mjs'))
    const orderNeedle = "['stage-sensevoice.mjs'"
    assert.ok(src.includes(orderNeedle) || src.includes('stage-python.mjs'))
    assert.ok(src.includes('ci.yml must run stage-python') || src.includes('stage-python.mjs'))
  })

  it('verify-packaged-runtime asserts python bundle + ffmpeg X_OK / -version', () => {
    const src = read('apps/desktop/scripts/verify-packaged-runtime.mjs')
    assert.ok(src.includes('bundle-manifest.json'))
    assert.ok(src.includes('assertPythonBundle'))
    assert.ok(src.includes('X_OK') || src.includes('constants.X_OK'))
    assert.ok(src.includes('-version'))
    assert.ok(src.includes('hostMatchesTarget'))
  })

  it('ci.yml: build:packages → stage-python → REQUIRE_STAGED_PYTHON audit', () => {
    const wf = read('.github/workflows/ci.yml')
    const packages = wf.indexOf('build:packages')
    const stagePy = wf.indexOf('stage-python.mjs')
    const audit = wf.indexOf('audit-desktop-pack.mjs')
    assert.ok(packages >= 0)
    assert.ok(stagePy >= 0)
    assert.ok(audit >= 0)
    assert.ok(packages < stagePy, 'build:packages before stage-python')
    assert.ok(stagePy < audit, 'stage-python before audit')
    assert.ok(wf.includes('OPPTRIX_AUDIT_REQUIRE_STAGED_PYTHON'))
  })

  it('release-desktop.yml: packages + stage-python + REQUIRE before audit', () => {
    const wf = read('.github/workflows/release-desktop.yml')
    const packages = wf.indexOf('build:packages')
    const stagePy = wf.indexOf('stage-python.mjs')
    const audit = wf.indexOf('audit-desktop-pack.mjs')
    assert.ok(packages >= 0)
    assert.ok(stagePy >= 0)
    assert.ok(audit >= 0)
    assert.ok(packages < stagePy)
    assert.ok(stagePy < audit)
    assert.ok(wf.includes('OPPTRIX_AUDIT_REQUIRE_STAGED_PYTHON'))
  })
})
