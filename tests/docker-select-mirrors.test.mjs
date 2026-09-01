/**
 * docker-select-mirrors.mjs — pure mirror selection (offline).
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  PROBE_TARGETS,
  CN_BUILD_MIRRORS,
  selectMirrorProfile,
  mirrorsForProfile,
  probeMirrorTargets,
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
      if (host.includes('npmmirror') || host.includes('aliyun')) {
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
      if (host.includes('npmmirror') || host.includes('aliyun')) {
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
  assert.equal(cn.npmRegistry, CN_BUILD_MIRRORS.npmRegistry)
  assert.equal(cn.aptMirror, CN_BUILD_MIRRORS.aptMirror)
  assert.match(cn.pipIndexUrl, /^https:\/\//)
})

test('mirrorsForProfile returns empty foreign mirrors', () => {
  const foreign = mirrorsForProfile('foreign')
  assert.equal(foreign.profile, 'foreign')
  assert.equal(foreign.npmRegistry, '')
  assert.equal(foreign.aptMirror, '')
})
