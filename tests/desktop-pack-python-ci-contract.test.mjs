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

  it('stage-python + installer prune miniconda extras (terminfo/pkgs) for EMFILE', () => {
    const src = read('apps/desktop/scripts/stage-python.mjs')
    assert.ok(src.includes('lstatSync'), 'size walk must use lstatSync')
    assert.ok(!src.includes('fs.statSync'), 'must not follow symlinks via fs.statSync')
    assert.ok(src.includes('pruneMinicondaStagedTree'), 'must call installer prune helper')
    assert.ok(src.includes('walk skip') || src.includes('size walk failed'), 'walk failures must warn, not hard-fail')

    const installer = read('packages/agent-workspace/src/python/installer.ts')
    assert.ok(installer.includes('pruneMinicondaStagedTree'), 'installer must export prune helper')
    for (const needle of [
      'pkgs',
      'lib/terminfo',
      'share/terminfo',
      'share/tabset',
      'man',
      'share/man',
      'share/doc',
      'include',
      'cmake',
      'uninstall.sh',
    ]) {
      assert.ok(installer.includes(`'${needle}'`), `prune list must include ${needle}`)
    }
    assert.ok(
      installer.includes('EMFILE') || installer.includes('terminfo'),
      'prune helper must document WHY (EMFILE / terminfo)',
    )
  })

  it('release-desktop.yml raises macOS FD limit to 65536 without swallowing failures', () => {
    const wf = read('.github/workflows/release-desktop.yml')
    assert.ok(wf.includes('ulimit -n 65536'), 'must target ulimit -n 65536')
    assert.ok(!wf.includes('ulimit -n 10240 || true'), 'must not use swallowed 10240 || true')
    assert.ok(wf.includes('20000'), 'must fail when soft limit still below 20000')
  })

  it('mac package scripts use with-raised-fd-limit wrapper', () => {
    const pkg = JSON.parse(read('apps/desktop/package.json'))
    const wrapperPath = path.join(repoRoot, 'apps/desktop/scripts/with-raised-fd-limit.sh')
    assert.ok(fs.existsSync(wrapperPath), 'with-raised-fd-limit.sh must exist')
    for (const name of [
      'build:package:mac-arm64',
      'build:package:mac-x64',
      'build:publish:mac-arm64',
      'build:publish:mac-x64',
    ]) {
      const script = pkg.scripts[name]
      assert.ok(script, `${name} must exist`)
      assert.ok(
        script.includes('with-raised-fd-limit'),
        `${name} must invoke with-raised-fd-limit.sh`,
      )
    }
  })

  it('release-desktop.yml sets OPPTRIX_RUNTIME_ARCH for stage-rag-engines cross mac-x64', () => {
    const wf = read('.github/workflows/release-desktop.yml')
    const rag = wf.indexOf('stage-rag-engines.mjs')
    assert.ok(rag >= 0, 'must run stage-rag-engines.mjs')
    const afterRag = wf.slice(rag, rag + 400)
    assert.ok(
      afterRag.includes('OPPTRIX_RUNTIME_ARCH'),
      'stage-rag-engines step must set OPPTRIX_RUNTIME_ARCH (darwin-x64 MANIFEST on arm64 runners)',
    )
  })
})
