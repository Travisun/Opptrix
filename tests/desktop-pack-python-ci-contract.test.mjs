/**
 * Contract: CI / release / prebuild / audit / verify-packaged-runtime stay aligned
 * on staged Python + ffmpeg executable checks.
 */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
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

  it('mac.signIgnore skips playwright-browsers + python + node_modules (EMFILE)', () => {
    const pkg = JSON.parse(read('apps/desktop/package.json'))
    const signIgnore = pkg.build?.mac?.signIgnore
    assert.ok(Array.isArray(signIgnore), 'build.mac.signIgnore must be an array')
    for (const needle of ['playwright-browsers', 'Contents/Resources/python', 'runtime-stage/node_modules']) {
      assert.ok(
        signIgnore.some((p) => String(p).includes(needle) || needle.includes(String(p))),
        `signIgnore must cover ${needle}`,
      )
    }
  })

  it('afterPack serially pre-signs python + node_modules + playwright-browsers Mach-O', () => {
    const src = read('apps/desktop/scripts/after-pack-adhoc.cjs')
    assert.ok(src.includes('preSignHeavyMacTrees'), 'must define preSignHeavyMacTrees')
    assert.ok(src.includes('preSignHeavyMacTrees(context)'), 'afterPack must call pre-sign')
    assert.ok(src.includes('--options'), 'pre-sign must use hardened runtime options')
    assert.ok(src.includes("'runtime'"), 'pre-sign must pass runtime option')
    assert.ok(src.includes('python'), 'must target python tree')
    assert.ok(src.includes('node_modules'), 'must target node_modules tree')
    assert.ok(src.includes('playwright-browsers'), 'must pre-sign playwright (signIgnore + notary)')
    assert.ok(src.includes('collectNestedBundles'), 'must deep-sign nested Chrome .app/.framework')
    assert.ok(src.includes('--deep') || src.includes("deep: true"), 'nested bundles need --deep')
    assert.ok(src.includes('stashHeavyTreesForOsxSign'), 'must stash heavy trees before osx-sign walk')
  })

  it('afterSign restores stashed heavy trees and re-seals outer app', () => {
    const pkg = JSON.parse(read('apps/desktop/package.json'))
    assert.equal(pkg.build?.afterSign, './scripts/after-sign-restore-heavy.cjs')
    const src = read('apps/desktop/scripts/after-sign-restore-heavy.cjs')
    assert.ok(src.includes('.opptrix-sign-stash'))
    assert.ok(src.includes('re-sealing') || src.includes('re-seal'))
    assert.ok(!src.includes("'--deep'") || src.includes('No --deep'), 'outer re-seal must not --deep')
  })

  it('release-desktop.yml: stage-shared-models once; matrix restores + skips re-stage', () => {
    const wf = read('.github/workflows/release-desktop.yml')
    assert.ok(wf.includes('stage-shared-models:'), 'must define stage-shared-models job')
    assert.ok(wf.includes('desktop-shared-models'), 'must use desktop-shared-models artifact')
    assert.ok(wf.includes('desktop-shared-models-v1'), 'must cache with desktop-shared-models-v1')
    assert.ok(
      wf.includes('OPPTRIX_MODEL_SOURCE_ORDER: huggingface,modelscope'),
      'shared job must prefer foreign mirrors',
    )
    assert.ok(wf.includes('HF_TOKEN'), 'must optionally inject HF_TOKEN')
    assert.ok(
      wf.includes('OPPTRIX_SKIP_SHARED_MODEL_STAGE'),
      'matrix must set OPPTRIX_SKIP_SHARED_MODEL_STAGE',
    )
    assert.ok(
      wf.includes('needs: [prepare-release, stage-shared-models]'),
      'release matrix must need stage-shared-models',
    )
    const releaseJobIdx = wf.indexOf('\n  release:')
    assert.ok(releaseJobIdx >= 0)
    const releaseSection = wf.slice(releaseJobIdx)
    assert.ok(
      !/name:\s*Stage bundled SenseVoice/.test(releaseSection),
      'matrix must not Stage bundled SenseVoice (use artifact)',
    )
    assert.ok(
      !/name:\s*Stage bundled e5/.test(releaseSection),
      'matrix must not Stage bundled e5 (use artifact)',
    )
    assert.ok(
      !/name:\s*Stage bundled RapidOCR/.test(releaseSection),
      'matrix must not Stage bundled RapidOCR (use artifact)',
    )
  })

  it('prebuild skips shared model stage when OPPTRIX_SKIP_SHARED_MODEL_STAGE=1', () => {
    const src = read('apps/desktop/scripts/prebuild.mjs')
    assert.ok(src.includes('OPPTRIX_SKIP_SHARED_MODEL_STAGE'))
    assert.ok(src.includes('stage-sensevoice.mjs'))
    assert.ok(src.includes('stage-e5.mjs'))
    assert.ok(src.includes('stage-rapidocr.mjs'))
  })

  it('model-download lib resolves CI foreign-first order + HF auth', () => {
    const src = read('apps/desktop/scripts/lib/model-download.mjs')
    assert.ok(src.includes('resolveSourceOrder'))
    assert.ok(src.includes("'huggingface'"))
    assert.ok(src.includes('HF_TOKEN'))
    assert.ok(src.includes('HUGGING_FACE_HUB_TOKEN'))
    assert.ok(src.includes('downloadWithRetries'))
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

  it('release-desktop.yml sets job-level OPPTRIX_RUNTIME_ARCH for all release steps', () => {
    const wf = read('.github/workflows/release-desktop.yml')
    const releaseJob = wf.indexOf('name: ${{ matrix.label }}')
    assert.ok(releaseJob >= 0)
    const jobEnv = wf.slice(releaseJob, releaseJob + 1200)
    assert.ok(
      /env:\s*\n(?:[^\n]*\n)*?\s*OPPTRIX_RUNTIME_ARCH:\s*\$\{\{\s*matrix\.electron_arch\s*\}\}/.test(jobEnv)
      || jobEnv.includes('OPPTRIX_RUNTIME_ARCH: ${{ matrix.electron_arch }}'),
      'release job env must set OPPTRIX_RUNTIME_ARCH so verify-packaged-runtime sees cross-build arch',
    )
  })

  it('stage-runtime cross-builds Playwright via PLAYWRIGHT_HOST_PLATFORM_OVERRIDE', () => {
    const helper = read('apps/desktop/scripts/lib/playwright-host-platform.mjs')
    assert.ok(helper.includes('playwrightHostPlatformOverride'))
    assert.ok(helper.includes("'mac15'") || helper.includes('"mac15"'))
    assert.ok(helper.includes('ubuntu24.04'))
    const stage = read('apps/desktop/scripts/stage-runtime.mjs')
    assert.ok(stage.includes('playwrightCrossEnv'))
    assert.ok(stage.includes('PLAYWRIGHT_HOST_PLATFORM_OVERRIDE'))
    assert.ok(stage.includes('playwrightChromiumDirMarker'))
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
    assert.ok(
      /label:\s*Linux x64/.test(wf) && wf.includes('artifact: desktop-linux-x64'),
      'release matrix must include Linux x64',
    )
    assert.ok(
      wf.includes('pattern: desktop-linux-*'),
      'finalize must download desktop-linux-* (not desktop-* which pulls shared-models)',
    )
    assert.ok(wf.includes('desktop-release-bundle'), 'must produce desktop-release-bundle')
    assert.ok(wf.includes('actions/download-artifact@v4'), 'finalize/sync must download-artifact')
    assert.ok(
      wf.includes('sync-release-to-r2.mjs'),
      'must sync release assets to Cloudflare R2',
    )
    assert.ok(
      !wf.includes('sync-release-to-ftp.mjs') && !wf.includes('FTP_HOST'),
      'must not use FTP as the release distribution path',
    )
    assert.ok(
      !wf.includes('Require R2 or FTP') && !wf.includes('continue-on-error: true'),
      'R2 sync must hard-fail (no soft-fail / dual-path fallback)',
    )
    assert.ok(
      !/Skip R2 sync for draft/i.test(wf) && !/skip=true.*[Dd]raft/.test(wf),
      'draft must not skip R2 sync',
    )
    const syncIdx = wf.indexOf('name: Sync release to Cloudflare R2')
    assert.ok(syncIdx >= 0, 'must have Sync release to Cloudflare R2 job')
    const syncSection = wf.slice(syncIdx, syncIdx + 3500)
    assert.ok(
      syncSection.includes('desktop-release-bundle'),
      'sync-r2 must download desktop-release-bundle',
    )
    assert.ok(!syncSection.includes('gh release download'), 'sync-r2 must not download from GH Release')
    assert.ok(
      syncSection.includes('Verify R2 credentials') && syncSection.includes('sync-release-to-r2.mjs'),
      'sync-r2 must verify credentials then sync-release-to-r2',
    )
    assert.ok(
      wf.includes('name: Sync experts to R2') && !wf.includes('Skipping experts R2 sync'),
      'experts R2 sync must run after sync-r2 (not skipped)',
    )
  })

  it('release-desktop.yml: formal tags create non-draft Notes-only Release (downloads → opptrix.org)', () => {
    const wf = read('.github/workflows/release-desktop.yml')
    const ensureIdx = wf.indexOf('Ensure GitHub Release exists')
    assert.ok(ensureIdx >= 0, 'must have Ensure GitHub Release exists step')
    const ensureSection = wf.slice(ensureIdx, ensureIdx + 2800)
    assert.ok(
      ensureSection.includes('opptrix.org'),
      'prepare-release comments/notes path must mention opptrix.org downloads',
    )
    assert.ok(
      !ensureSection.includes('DRAFT_FLAG'),
      'must not use DRAFT_FLAG / default --draft on create',
    )
    assert.ok(
      !/gh release create[\s\S]*?--draft(?!=false)/.test(ensureSection),
      'gh release create must not pass --draft for formal or dev tags',
    )
    assert.ok(
      ensureSection.includes('--prerelease'),
      '*-dev* tags may use --prerelease',
    )
    assert.ok(
      ensureSection.includes('--draft=false'),
      'existing draft non-dev releases must be published with --draft=false',
    )
  })

  it('assemble-release-notes: points downloads to opptrix.org (no GH assets)', () => {
    const out = execFileSync(
      process.execPath,
      ['scripts/assemble-release-notes.mjs', '1.3.4'],
      { encoding: 'utf8', cwd: repoRoot },
    )
    assert.ok(out.includes('https://opptrix.org/'), 'must include official download URL')
    assert.ok(
      /不在.*GitHub Release|GitHub Release 附件/.test(out),
      'must state installers are not GitHub Release attachments',
    )
    assert.ok(out.includes('## 新功能') && out.includes('## 修复'))
  })

  it('resync-desktop-r2.yml: artifact bundle only (no GH Release download, R2-only)', () => {
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
    assert.ok(wf.includes('sync-release-to-r2.mjs'), 'resync must sync to R2')
    assert.ok(!wf.includes('sync-release-to-ftp.mjs'), 'resync must not sync to FTP')
    assert.ok(!wf.includes('continue-on-error: true'), 'R2 resync must hard-fail')
  })
})
