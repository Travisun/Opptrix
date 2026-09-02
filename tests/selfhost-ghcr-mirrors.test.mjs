import assert from 'node:assert/strict'
import test from 'node:test'
import {
  applyRegistryHost,
  CN_GHCR_MIRROR_HOSTS,
  CN_NPM_REGISTRY_CANDIDATES,
  formatGhcrProbeResults,
  normalizeRegistryHost,
  OFFICIAL_GHCR_HOST,
  rankHostsByLatency,
  resolveGhcrPullRepositories,
} from '../packages/selfhost/src/mirrors.mjs'
import { resolveImageRef } from '../packages/selfhost/src/app-refs.mjs'

test('CN_GHCR_MIRROR_HOSTS ordered NJU → milu → linkos (no 1ms GHCR)', () => {
  assert.deepEqual([...CN_GHCR_MIRROR_HOSTS], [
    'ghcr.nju.edu.cn',
    'ghcr.milu.moe',
    'ghcr.linkos.org',
  ])
  assert.ok(!CN_GHCR_MIRROR_HOSTS.includes('ghcr.1ms.run'))
  assert.ok(!CN_GHCR_MIRROR_HOSTS.includes(OFFICIAL_GHCR_HOST))
})

test('CN_NPM_REGISTRY_CANDIDATES Huawei → Tencent → official empty', () => {
  assert.deepEqual([...CN_NPM_REGISTRY_CANDIDATES], [
    'https://mirrors.huaweicloud.com/repository/npm/',
    'https://mirrors.cloud.tencent.com/npm/',
    '',
  ])
})

test('normalizeRegistryHost strips scheme and path', () => {
  assert.equal(normalizeRegistryHost('https://ghcr.nju.edu.cn/'), 'ghcr.nju.edu.cn')
  assert.equal(normalizeRegistryHost('ghcr.milu.moe/travisun/opptrix'), 'ghcr.milu.moe')
})

test('applyRegistryHost rewrites ghcr.io and existing mirrors', () => {
  assert.equal(
    applyRegistryHost('ghcr.io/travisun/opptrix', 'ghcr.nju.edu.cn'),
    'ghcr.nju.edu.cn/travisun/opptrix',
  )
  assert.equal(
    applyRegistryHost('ghcr.nju.edu.cn/travisun/opptrix', 'ghcr.milu.moe'),
    'ghcr.milu.moe/travisun/opptrix',
  )
  assert.equal(
    applyRegistryHost('ghcr.io/travisun/opptrix', OFFICIAL_GHCR_HOST),
    'ghcr.io/travisun/opptrix',
  )
})

test('rankHostsByLatency prefers faster reachable host', () => {
  const { winner, ranked, results } = rankHostsByLatency(
    [...CN_GHCR_MIRROR_HOSTS],
    {
      probeFn: (host) => {
        if (host === 'ghcr.milu.moe') return { host, ok: true, ms: 40 }
        if (host === 'ghcr.nju.edu.cn') return { host, ok: true, ms: 120 }
        if (host === 'ghcr.linkos.org') return { host, ok: true, ms: 80 }
        return { host, ok: false, ms: Number.POSITIVE_INFINITY }
      },
    },
  )
  assert.equal(winner, 'ghcr.milu.moe')
  assert.equal(ranked[0], 'ghcr.milu.moe')
  assert.equal(ranked[1], 'ghcr.linkos.org')
  assert.equal(ranked[2], 'ghcr.nju.edu.cn')
  assert.equal(results.length, 3)
  assert.match(formatGhcrProbeResults(results), /ghcr\.milu\.moe 40ms/)
})

test('resolveGhcrPullRepositories foreign uses official ghcr.io', () => {
  const plan = resolveGhcrPullRepositories({
    profile: 'foreign',
    imageRepository: 'ghcr.io/travisun/opptrix',
    env: {},
  })
  assert.equal(plan.winnerHost, OFFICIAL_GHCR_HOST)
  assert.deepEqual(plan.repositories, ['ghcr.io/travisun/opptrix'])
  assert.equal(plan.reason, 'official-ghcr')
})

test('resolveGhcrPullRepositories cn ranks mirrors then official fallback', () => {
  const plan = resolveGhcrPullRepositories({
    profile: 'cn',
    imageRepository: 'ghcr.io/travisun/opptrix',
    env: {},
    probeFn: (host) => {
      if (host === 'ghcr.nju.edu.cn') return { host, ok: true, ms: 30 }
      if (host === 'ghcr.milu.moe') return { host, ok: true, ms: 90 }
      if (host === 'ghcr.linkos.org') return { host, ok: true, ms: 60 }
      return { host, ok: false, ms: Number.POSITIVE_INFINITY }
    },
  })
  assert.equal(plan.winnerHost, 'ghcr.nju.edu.cn')
  assert.equal(plan.repositories[0], 'ghcr.nju.edu.cn/travisun/opptrix')
  assert.equal(plan.repositories[1], 'ghcr.linkos.org/travisun/opptrix')
  assert.equal(plan.repositories[2], 'ghcr.milu.moe/travisun/opptrix')
  assert.equal(plan.repositories[3], 'ghcr.io/travisun/opptrix')
  assert.ok(plan.repositories.includes('ghcr.io/travisun/opptrix'))
  assert.ok(!plan.repositories.some((r) => r.includes('ghcr.1ms.run')))
  assert.match(plan.reason, /cn-speed-test:ghcr\.nju\.edu\.cn/)
})

test('OPPTRIX_GHCR_MIRROR forces host without probing', () => {
  const plan = resolveGhcrPullRepositories({
    profile: 'cn',
    imageRepository: 'ghcr.io/travisun/opptrix',
    env: { OPPTRIX_GHCR_MIRROR: 'https://ghcr.linkos.org/' },
    probeFn: () => {
      throw new Error('should not probe')
    },
  })
  assert.equal(plan.winnerHost, 'ghcr.linkos.org')
  assert.deepEqual(plan.repositories, ['ghcr.linkos.org/travisun/opptrix'])
  assert.equal(plan.reason, 'OPPTRIX_GHCR_MIRROR')
})

test('resolveImageRef accepts registryHost rewrite', () => {
  assert.equal(
    resolveImageRef('opptrix-selfhost-v1.3.6', { registryHost: 'ghcr.nju.edu.cn' }),
    'ghcr.nju.edu.cn/travisun/opptrix:opptrix-selfhost-v1.3.6',
  )
})
