import assert from 'node:assert/strict'
import test from 'node:test'
import {
  AUTHORITATIVE_UPDATE_CDN_BASE,
  CN_UPDATE_CDN_BASES,
  buildArchPackageMirrors,
  buildLegacyPackageMirrors,
  buildRuntimeDownloadCandidates,
  giteeReleaseAssetUrl,
  githubReleaseAssetUrl,
  resolveCheckUpdateCdnBases,
  rewriteCdnBase,
} from '../scripts/lib/runtime-release-mirrors.mjs'
import {
  AUTHORITATIVE_UPDATE_CDN_BASE as AUTH_TS,
  CN_UPDATE_CDN_BASES as CN_BASES_TS,
  buildRuntimeDownloadCandidates as buildCandidatesTs,
  resolveCheckUpdateCdnBases as resolveCheckUpdateCdnBasesTs,
  resolveUpdateMirrorProfile,
  rewriteCdnBase as rewriteCdnBaseTs,
} from '../packages/system-update/dist/index.js'

const REFS = {
  binUrl: 'https://update.opptrix.org/hot/packages/opptrix-runtime-linux-x64-v1.4.0.bin',
  sha256Url: 'https://update.opptrix.org/hot/packages/opptrix-runtime-linux-x64-v1.4.0.sha256',
  mirrors: buildArchPackageMirrors('1.4.0', 'linux-x64'),
}

const EVZS = 'https://update.opptrix.evzs.com'
const ORG = 'https://update.opptrix.org'

test('CDN base constants align script ↔ package', () => {
  assert.equal(AUTHORITATIVE_UPDATE_CDN_BASE, ORG)
  assert.equal(AUTH_TS, ORG)
  assert.deepEqual([...CN_UPDATE_CDN_BASES], [EVZS, ORG])
  assert.deepEqual([...CN_BASES_TS], [EVZS, ORG])
})

test('resolveCheckUpdateCdnBases prefers org then CN failover', () => {
  assert.deepEqual(resolveCheckUpdateCdnBases(), [ORG, EVZS])
  assert.deepEqual(resolveCheckUpdateCdnBasesTs(), [ORG, EVZS])
  assert.deepEqual(
    resolveCheckUpdateCdnBases({ configuredBase: ORG }),
    [ORG, EVZS],
  )
})

test('rewriteCdnBase preserves path under new host', () => {
  const url = `${ORG}/hot/packages/opptrix-runtime-linux-x64-v1.4.0.bin`
  assert.equal(
    rewriteCdnBase(url, EVZS),
    `${EVZS}/hot/packages/opptrix-runtime-linux-x64-v1.4.0.bin`,
  )
  assert.equal(rewriteCdnBaseTs(url, EVZS), rewriteCdnBase(url, EVZS))
})

test('release mirror helper URLs (github + legacy gitee URL builder)', () => {
  assert.equal(
    githubReleaseAssetUrl('Travisun/Opptrix', 'runtime-v1.4.0', 'opptrix-runtime-linux-x64-v1.4.0.bin'),
    'https://github.com/Travisun/Opptrix/releases/download/runtime-v1.4.0/opptrix-runtime-linux-x64-v1.4.0.bin',
  )
  // Builder kept for old tooling; runtime download no longer uses gitee.
  assert.equal(
    giteeReleaseAssetUrl('Travisun/Opptrix', 'runtime-v1.4.0', 'opptrix-runtime-linux-x64-v1.4.0.bin'),
    'https://gitee.com/Travisun/Opptrix/releases/download/runtime-v1.4.0/opptrix-runtime-linux-x64-v1.4.0.bin',
  )
})

test('new manifests emit github only (no gitee)', () => {
  const arch = buildArchPackageMirrors('2.0.0', 'linux-arm64')
  assert.match(arch.github.bin, /github\.com.*\/runtime-v2\.0\.0\/.*linux-arm64-v2\.0\.0\.bin/)
  assert.equal(arch.gitee, undefined)

  const legacy = buildLegacyPackageMirrors('2.0.0')
  assert.match(legacy.github.bin, /\/runtime-v2\.0\.0\/opptrix-runtime-v2\.0\.0\.bin/)
  assert.equal(legacy.gitee, undefined)
})

test('buildRuntimeDownloadCandidates cn: evzs → update.org → github; no gitee', () => {
  const cn = buildRuntimeDownloadCandidates(REFS, 'cn')
  assert.deepEqual(cn.map((c) => c.source), ['cdn_cn', 'cdn', 'github'])
  assert.equal(cn[0].binUrl, `${EVZS}/hot/packages/opptrix-runtime-linux-x64-v1.4.0.bin`)
  assert.equal(cn[1].binUrl, `${ORG}/hot/packages/opptrix-runtime-linux-x64-v1.4.0.bin`)
  assert.equal(cn[2].binUrl, REFS.mirrors.github.bin)
  assert.ok(cn.every((c) => !c.binUrl.includes('gitee.com')))
  assert.ok(!cn.some((c) => c.source === 'gitee'))
})

test('buildRuntimeDownloadCandidates foreign: cdn → github; no gitee', () => {
  const foreign = buildRuntimeDownloadCandidates(REFS, 'foreign')
  assert.deepEqual(foreign.map((c) => c.source), ['cdn', 'github'])
  assert.equal(foreign[0].binUrl, REFS.binUrl)
  assert.equal(foreign[1].binUrl, REFS.mirrors.github.bin)
  assert.ok(foreign.every((c) => !c.binUrl.includes('gitee.com')))
  assert.ok(!foreign.some((c) => c.source === 'gitee'))
})

test('old mirrors.gitee is ignored in candidate list', () => {
  const refs = {
    ...REFS,
    mirrors: {
      github: REFS.mirrors.github,
      gitee: {
        bin: 'https://gitee.com/Travisun/Opptrix/releases/download/runtime-v1.4.0/x.bin',
        sha256: 'https://gitee.com/Travisun/Opptrix/releases/download/runtime-v1.4.0/x.sha256',
      },
    },
  }
  for (const profile of /** @type {const} */ (['cn', 'foreign'])) {
    const candidates = buildRuntimeDownloadCandidates(refs, profile)
    assert.ok(candidates.every((c) => !c.binUrl.includes('gitee.com')))
    assert.ok(!candidates.some((c) => c.source === 'gitee'))
  }
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
  assert.deepEqual(cnPkg.map((c) => c.binUrl), cnScript.map((c) => c.binUrl))

  const foreignScript = buildRuntimeDownloadCandidates(REFS, 'foreign')
  const foreignPkg = buildCandidatesTs(
    {
      binUrl: REFS.binUrl,
      sha256Url: REFS.sha256Url,
      mirrors: REFS.mirrors,
    },
    'foreign',
  )
  assert.deepEqual(foreignPkg.map((c) => c.source), foreignScript.map((c) => c.source))
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
