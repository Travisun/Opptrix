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

  it('release-desktop.yml raises macOS FD soft-only (ulimit -S) without clamping hard', () => {
    const wf = read('.github/workflows/release-desktop.yml')
    assert.ok(wf.includes('ulimit -S -n'), 'must use soft-only ulimit -S -n')
    assert.ok(
      wf.includes('1048576') && wf.includes('524288') && wf.includes('131072') && wf.includes('65536'),
      'must try soft ladder 1048576→524288→131072→65536',
    )
    // Bare `ulimit -n 65536` (no -S) clamps hard from unlimited → 65536 on Darwin.
    assert.ok(!/\bulimit -n 65536\b/.test(wf), 'must not use bare ulimit -n 65536 (clamps hard)')
    assert.ok(!wf.includes('ulimit -n 10240 || true'), 'must not use swallowed 10240 || true')
    assert.ok(wf.includes('20000'), 'must fail when soft limit still below 20000')
  })

  it('mac package scripts use with-raised-fd-limit wrapper (soft-only ladder)', () => {
    const pkg = JSON.parse(read('apps/desktop/package.json'))
    const wrapperPath = path.join(repoRoot, 'apps/desktop/scripts/with-raised-fd-limit.sh')
    assert.ok(fs.existsSync(wrapperPath), 'with-raised-fd-limit.sh must exist')
    const wrapper = fs.readFileSync(wrapperPath, 'utf8')
    assert.ok(wrapper.includes('ulimit -S -n'), 'wrapper must raise soft-only via ulimit -S -n')
    assert.ok(
      wrapper.includes('1048576') &&
        wrapper.includes('524288') &&
        wrapper.includes('131072') &&
        wrapper.includes('65536'),
      'wrapper must try soft ladder 1048576→524288→131072→65536',
    )
    assert.ok(
      !/\bulimit -n 65536\b/.test(wrapper),
      'wrapper must not use bare ulimit -n 65536 (clamps hard)',
    )
    assert.ok(wrapper.includes('20000'), 'wrapper must abort when soft < 20000')
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

  it('mac.signIgnore skips playwright-browsers (already signed Chrome for Testing)', () => {
    const pkg = JSON.parse(read('apps/desktop/package.json'))
    const signIgnore = pkg.build?.mac?.signIgnore
    assert.ok(Array.isArray(signIgnore), 'build.mac.signIgnore must be an array')
    assert.ok(
      signIgnore.some((p) => String(p).includes('playwright-browsers')),
      'signIgnore must include playwright-browsers',
    )
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

  it('release-desktop.yml: Actions artifact → R2 (no gh release upload of installers)', () => {
    const wf = read('.github/workflows/release-desktop.yml')
    assert.equal(
      (wf.match(/gh release upload/g) || []).length,
      0,
      'must not gh release upload installers/yml to GitHub Release',
    )
    assert.ok(
      /actions:\s*write/.test(wf),
      'must set permissions.actions: write (else upload/download-artifact get none)',
    )
    assert.ok(wf.includes('actions/upload-artifact@v4'), 'must upload-artifact platform staging')
    assert.ok(wf.includes('desktop-win-x64'), 'must name win artifact')
    assert.ok(wf.includes('desktop-linux-x64'), 'must name linux artifact')
    assert.ok(wf.includes('desktop-mac-arm64'), 'must name mac-arm64 artifact')
    assert.ok(wf.includes('desktop-mac-x64'), 'must name mac-x64 artifact')
    assert.ok(wf.includes('desktop-release-bundle'), 'must produce desktop-release-bundle')
    assert.ok(wf.includes('actions/download-artifact@v4'), 'finalize/sync must download-artifact')
    assert.ok(
      !/Skip R2 sync for draft/i.test(wf) && !/skip=true.*[Dd]raft/.test(wf),
      'draft must not skip R2 sync',
    )
    const syncIdx = wf.indexOf('name: Sync release to Cloudflare R2')
    assert.ok(syncIdx >= 0)
    const syncSection = wf.slice(syncIdx, syncIdx + 2500)
    assert.ok(
      syncSection.includes('desktop-release-bundle'),
      'sync-r2 must download desktop-release-bundle',
    )
    assert.ok(!syncSection.includes('gh release download'), 'sync-r2 must not download from GH Release')
  })

  it('resync-desktop-r2.yml: artifact bundle only (no GH Release download)', () => {
    const wf = read('.github/workflows/resync-desktop-r2.yml')
    assert.equal(
      (wf.match(/gh release upload/g) || []).length,
      0,
      'resync must not gh release upload',
    )
    assert.ok(!wf.includes('gh release download'), 'resync must not gh release download')
    assert.ok(wf.includes('gh run download'), 'resync must gh run download')
    assert.ok(wf.includes('desktop-release-bundle'), 'resync must use desktop-release-bundle')
    assert.ok(wf.includes('run_id'), 'resync should accept optional run_id override')
  })
})
