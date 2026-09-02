import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  CI_LIFECYCLE_IMAGE,
  DEFAULT_LIFECYCLE_IMAGE,
  LIFECYCLE_APP_VERSIONS,
  LIFECYCLE_BASE_VERSIONS,
  LIFECYCLE_MARKER_CONTENT,
  LIFECYCLE_MARKER_REL,
  LIFECYCLE_PORT_RANGE,
  classifyActivatePendingOutput,
  dockerImageExists,
  isHealthOk,
  parseHealthBody,
  pickHostPort,
  resourceNames,
} from '../scripts/lib/selfhost-lifecycle.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SMOKE = path.join(ROOT, 'scripts', 'smoke-selfhost-lifecycle.mjs')

test('resourceNames uses pid-scoped unique ids', () => {
  const n = resourceNames(4242)
  assert.equal(n.container, 'opptrix-lc-4242-ctr')
  assert.equal(n.volume, 'opptrix-lc-4242-vol')
})

test('pickHostPort stays in configured range', () => {
  assert.equal(pickHostPort({ random: () => 0 }), LIFECYCLE_PORT_RANGE.min)
  assert.equal(pickHostPort({ random: () => 0.999 }), LIFECYCLE_PORT_RANGE.max)
  assert.equal(pickHostPort({ min: 10, max: 10, random: () => 0.5 }), 10)
  assert.throws(() => pickHostPort({ min: 5, max: 4 }))
})

test('parseHealthBody + isHealthOk', () => {
  assert.equal(parseHealthBody(''), null)
  assert.equal(parseHealthBody('not-json'), null)
  assert.deepEqual(parseHealthBody('{"status":"ok","version":"1.0.0"}'), {
    status: 'ok',
    version: '1.0.0',
  })
  assert.equal(isHealthOk({ status: 'ok' }), true)
  assert.equal(isHealthOk({ status: 'degraded' }), false)
  assert.equal(isHealthOk(null), false)
})

test('classifyActivatePendingOutput', () => {
  assert.equal(
    classifyActivatePendingOutput('[system-boot] activate-pending: skip 1.1.0 (needsBaseRefresh: host base…)'),
    'skipped-base',
  )
  assert.equal(
    classifyActivatePendingOutput('[system-boot] activate-pending: no pendingVersion — noop'),
    'noop',
  )
  assert.equal(
    classifyActivatePendingOutput('[system-boot] activated → 1.0.1 path=/opptrix/system/slots/1.0.1'),
    'activated',
  )
  assert.equal(classifyActivatePendingOutput('noise'), 'unknown')
})

test('version constants are clean semver / base tags', () => {
  assert.match(LIFECYCLE_APP_VERSIONS.start, /^\d+\.\d+\.\d+$/)
  assert.match(LIFECYCLE_APP_VERSIONS.hot, /^\d+\.\d+\.\d+$/)
  assert.match(LIFECYCLE_APP_VERSIONS.base, /^\d+\.\d+\.\d+$/)
  assert.ok(LIFECYCLE_BASE_VERSIONS.start.startsWith('opptrix-selfhost-v'))
  assert.ok(LIFECYCLE_BASE_VERSIONS.next.startsWith('opptrix-selfhost-v'))
  assert.equal(LIFECYCLE_MARKER_REL, 'private/lifecycle-smoke-marker')
  assert.ok(LIFECYCLE_MARKER_CONTENT.length > 0)
})

test('dockerImageExists respects inspect deps', () => {
  assert.equal(
    dockerImageExists('opptrix:x', { inspect: () => ({ status: 0 }) }),
    true,
  )
  assert.equal(
    dockerImageExists('opptrix:x', { inspect: () => ({ status: 1 }) }),
    false,
  )
  assert.equal(dockerImageExists(''), false)
})

test('lifecycle smoke isolates CDN and background updates', async () => {
  const src = await fs.promises.readFile(SMOKE, 'utf8')
  assert.match(src, /OPPTRIX_UPDATE_ENABLED:\s*'0'/)
  assert.match(src, /OPPTRIX_BOOT_CDN_CHECK:\s*'0'/)
  assert.match(src, /stage did not persist pending/)
})

test('optional docker lifecycle smoke when image present', async (t) => {
  const candidates = [
    process.env.OPPTRIX_LIFECYCLE_IMAGE?.trim(),
    DEFAULT_LIFECYCLE_IMAGE,
    CI_LIFECYCLE_IMAGE,
  ].filter(Boolean)

  let image = null
  for (const cand of candidates) {
    if (dockerImageExists(cand)) {
      image = cand
      break
    }
  }
  if (!image) {
    t.skip(`no lifecycle image (${DEFAULT_LIFECYCLE_IMAGE} / ${CI_LIFECYCLE_IMAGE})`)
    return
  }

  const r = spawnSync(process.execPath, [SMOKE], {
    cwd: ROOT,
    encoding: 'utf8',
    env: {
      ...process.env,
      OPPTRIX_LIFECYCLE_IMAGE: image,
    },
    timeout: 10 * 60 * 1000,
  })
  assert.equal(
    r.status,
    0,
    `lifecycle smoke failed (status=${r.status})\nstdout:\n${r.stdout}\nstderr:\n${r.stderr}`,
  )
  assert.match(String(r.stdout || ''), /all phases passed/)
})
