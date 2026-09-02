import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildArchPackageMirrors,
  buildLegacyPackageMirrors,
  buildRuntimeDownloadCandidates,
  giteeReleaseAssetUrl,
  githubReleaseAssetUrl,
} from '../scripts/lib/runtime-release-mirrors.mjs'
import {
  buildRuntimeDownloadCandidates as buildCandidatesTs,
  resolveUpdateMirrorProfile,
} from '../packages/system-update/dist/index.js'

const REFS = {
  binUrl: 'https://update.opptrix.org/hot/packages/opptrix-runtime-linux-x64-v1.4.0.bin',
  sha256Url: 'https://update.opptrix.org/hot/packages/opptrix-runtime-linux-x64-v1.4.0.sha256',
  mirrors: buildArchPackageMirrors('1.4.0', 'linux-x64'),
}

test('release mirror URLs follow GitHub/Gitee release download layout', () => {
  assert.equal(
    githubReleaseAssetUrl('Travisun/Opptrix', 'opptrix-selfhost-v1.4.0', 'opptrix-runtime-linux-x64-v1.4.0.bin'),
    'https://github.com/Travisun/Opptrix/releases/download/opptrix-selfhost-v1.4.0/opptrix-runtime-linux-x64-v1.4.0.bin',
  )
  assert.equal(
    giteeReleaseAssetUrl('Travisun/Opptrix', 'opptrix-selfhost-v1.4.0', 'opptrix-runtime-linux-x64-v1.4.0.bin'),
    'https://gitee.com/Travisun/Opptrix/releases/download/opptrix-selfhost-v1.4.0/opptrix-runtime-linux-x64-v1.4.0.bin',
  )
})

test('buildArchPackageMirrors and legacy mirrors include github + gitee pairs', () => {
  const arch = buildArchPackageMirrors('2.0.0', 'linux-arm64')
  assert.match(arch.github.bin, /github\.com.*linux-arm64-v2\.0\.0\.bin/)
  assert.match(arch.gitee.sha256, /gitee\.com.*linux-arm64-v2\.0\.0\.sha256/)

  const legacy = buildLegacyPackageMirrors('2.0.0')
  assert.match(legacy.github.bin, /opptrix-runtime-v2\.0\.0\.bin/)
  assert.match(legacy.gitee.sha256, /opptrix-runtime-v2\.0\.0\.sha256/)
})

test('buildRuntimeDownloadCandidates orders cn vs foreign', () => {
  const cn = buildRuntimeDownloadCandidates(REFS, 'cn')
  assert.deepEqual(cn.map((c) => c.source), ['gitee', 'github', 'cdn'])

  const foreign = buildRuntimeDownloadCandidates(REFS, 'foreign')
  assert.deepEqual(foreign.map((c) => c.source), ['github', 'gitee', 'cdn'])

  assert.equal(cn[0].binUrl, REFS.mirrors.gitee.bin)
  assert.equal(foreign[0].binUrl, REFS.mirrors.github.bin)
  assert.equal(cn.at(-1).binUrl, REFS.binUrl)
})

test('@opptrix/system-update buildRuntimeDownloadCandidates matches script helper', () => {
  const cnScript = buildRuntimeDownloadCandidates(REFS, 'cn')
  const cnPkg = buildCandidatesTs(
    {
      binUrl: REFS.binUrl,
      sha256Url: REFS.sha256Url,
      mirrors: REFS.mirrors,
    },
    'cn',
  )
  assert.deepEqual(cnPkg.map((c) => c.source), cnScript.map((c) => c.source))
})

test('resolveUpdateMirrorProfile honors explicit env', () => {
  assert.equal(resolveUpdateMirrorProfile({ OPPTRIX_UPDATE_MIRROR: 'cn' }).profile, 'cn')
  assert.equal(resolveUpdateMirrorProfile({ OPPTRIX_MIRROR: 'foreign' }).profile, 'foreign')
  assert.equal(resolveUpdateMirrorProfile({ OPPTRIX_FORCE_CN: '1' }).profile, 'cn')
  assert.equal(
    resolveUpdateMirrorProfile({ TZ: 'Asia/Shanghai', OPPTRIX_UPDATE_MIRROR: 'auto' }).profile,
    'cn',
  )
})
