/**
 * docker-select-mirrors.mjs — pure mirror selection (offline).
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  PROBE_TARGETS,
  CN_BUILD_MIRRORS,
  CN_NPM_REGISTRY_CANDIDATES,
  selectMirrorProfile,
  mirrorsForProfile,
  probeMirrorTargets,
  pickCnNpmRegistry,
  normalizeNpmRegistryUrl,
} from '../scripts/docker-select-mirrors.mjs'

test('PROBE_TARGETS covers npm and apt for cn and foreign', () => {
  const groups = new Set(PROBE_TARGETS.map((t) => `${t.group}:${t.id}`))
  assert.ok(groups.has('cn:npm'))
  assert.ok(groups.has('foreign:npm'))
  assert.ok(groups.has('cn:apt'))
  assert.ok(groups.has('foreign:apt'))
})

test('selectMirrorProfile prefers cn when clearly faster', () => {
  const probes = probeMirrorTargets(PROBE_TARGETS, {
    probeFn: (host) => {
      if (host.includes('huaweicloud') || host.includes('aliyun')) {
        return { host, ok: true, ms: 40 }
      }
      return { host, ok: true, ms: 400 }
    },
  })
  assert.equal(selectMirrorProfile(probes), 'cn')
})

test('selectMirrorProfile prefers foreign when cn unreachable', () => {
  const probes = probeMirrorTargets(PROBE_TARGETS, {
    probeFn: (host) => {
      if (host.includes('huaweicloud') || host.includes('aliyun')) {
        return { host, ok: false, ms: Number.POSITIVE_INFINITY }
      }
      return { host, ok: true, ms: 120 }
    },
  })
  assert.equal(selectMirrorProfile(probes), 'foreign')
})

test('selectMirrorProfile defaults foreign when all unreachable', () => {
  const probes = probeMirrorTargets(PROBE_TARGETS, {
    probeFn: (host) => ({ host, ok: false, ms: Number.POSITIVE_INFINITY }),
  })
  assert.equal(selectMirrorProfile(probes), 'foreign')
})

test('mirrorsForProfile returns CN defaults', () => {
  const cn = mirrorsForProfile('cn')
  assert.equal(cn.profile, 'cn')
  assert.equal(cn.dockerImagePrefix, 'docker.1ms.run/library/')
  assert.equal(cn.npmRegistry, CN_BUILD_MIRRORS.npmRegistry)
  assert.match(cn.npmRegistry, /huaweicloud\.com\/repository\/npm/)
  assert.equal(cn.aptMirror, CN_BUILD_MIRRORS.aptMirror)
  assert.match(cn.pipIndexUrl, /^https:\/\//)
})

test('mirrorsForProfile returns empty foreign mirrors', () => {
  const foreign = mirrorsForProfile('foreign')
  assert.equal(foreign.profile, 'foreign')
  assert.equal(foreign.npmRegistry, '')
  assert.equal(foreign.aptMirror, '')
})

test('CN_NPM_REGISTRY_CANDIDATES lists Huawei → Tencent → official empty', () => {
  assert.deepEqual([...CN_NPM_REGISTRY_CANDIDATES], [
    'https://mirrors.huaweicloud.com/repository/npm/',
    'https://mirrors.cloud.tencent.com/npm/',
    '',
  ])
})

test('CN_NPM_REGISTRY_CANDIDATES stays in sync with selfhost mirrors.mjs', async () => {
  const { CN_NPM_REGISTRY_CANDIDATES: fromSelfhost } = await import(
    '../packages/selfhost/src/mirrors.mjs'
  )
  assert.deepEqual([...CN_NPM_REGISTRY_CANDIDATES], [...fromSelfhost])
})

test('pickCnNpmRegistry skips unreachable and falls back to official', () => {
  const picked = pickCnNpmRegistry(
    ['https://mirrors.example.invalid/npm/', ''],
    { probeFn: () => ({ host: 'x', ok: false, ms: Number.POSITIVE_INFINITY }) },
  )
  assert.equal(picked.registry, '')
  assert.equal(picked.reason, 'official-npmjs')
})

test('pickCnNpmRegistry prefers first reachable Huawei', () => {
  const picked = pickCnNpmRegistry(CN_NPM_REGISTRY_CANDIDATES, {
    probeFn: (host) => ({
      host,
      ok: host.includes('huaweicloud'),
      ms: host.includes('huaweicloud') ? 20 : Number.POSITIVE_INFINITY,
    }),
  })
  assert.equal(normalizeNpmRegistryUrl(picked.registry), CN_NPM_REGISTRY_CANDIDATES[0])
  assert.match(picked.reason, /reachable/)
})
