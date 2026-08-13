import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const here = path.dirname(fileURLToPath(import.meta.url))
const {
  SIDECAR_GRACEFUL_MS,
  SIDECAR_HARD_EXTRA_MS,
  SIDECAR_HEALTH_POLL_MS,
  SIDECAR_RESTART_CAP_MS,
  restartDelayMs,
  shouldAutoRestart,
  createBackoffState,
  resetBackoff,
  recordBackoffFailure,
} = require('../apps/desktop/electron/sidecar-supervisor.cjs')

describe('sidecar-supervisor constants', () => {
  it('graceful stop is ≥ server shutdown forceExit (8s)', () => {
    assert.ok(SIDECAR_GRACEFUL_MS >= 8000)
    assert.equal(SIDECAR_GRACEFUL_MS, 8500)
  })

  it('headless-tick must not spawn sidecar (tray-only schedule model)', () => {
    const headlessSrc = fs.readFileSync(
      path.join(here, '../apps/desktop/electron/os-schedule/headless-tick.cjs'),
      'utf8',
    )
    assert.doesNotMatch(headlessSrc, /spawnSidecarProcess/)
    assert.doesNotMatch(headlessSrc, /stopChildAndWait/)
    assert.match(headlessSrc, /POST \/api\/schedule\/tick/)
    assert.match(headlessSrc, /not spawning sidecar/)
    const launch = require('../apps/desktop/electron/os-schedule/sidecar-launch.cjs')
    assert.equal(launch.SIDECAR_GRACEFUL_MS, SIDECAR_GRACEFUL_MS)
  })

  it('hard extra and health poll are positive sane values', () => {
    assert.ok(SIDECAR_HARD_EXTRA_MS >= 1000)
    assert.ok(SIDECAR_HEALTH_POLL_MS >= 15_000)
    assert.ok(SIDECAR_HEALTH_POLL_MS <= 30_000)
  })
})

describe('restartDelayMs', () => {
  it('starts at 1s and doubles until cap', () => {
    assert.equal(restartDelayMs(0), 1000)
    assert.equal(restartDelayMs(1), 2000)
    assert.equal(restartDelayMs(2), 4000)
    assert.equal(restartDelayMs(3), 8000)
    assert.equal(restartDelayMs(4), 16_000)
    assert.equal(restartDelayMs(5), SIDECAR_RESTART_CAP_MS)
    assert.equal(restartDelayMs(10), SIDECAR_RESTART_CAP_MS)
  })

  it('treats invalid failCount as 0', () => {
    assert.equal(restartDelayMs(-1), 1000)
    assert.equal(restartDelayMs(Number.NaN), 1000)
    assert.equal(restartDelayMs(undefined), 1000)
  })
})

describe('shouldAutoRestart', () => {
  const ok = {
    intentionalStop: false,
    isQuitting: false,
    isUpdating: false,
    isDev: false,
    apiPortMode: 'use',
  }

  it('allows packaged owned sidecar when idle', () => {
    assert.equal(shouldAutoRestart(ok), true)
    assert.equal(shouldAutoRestart({ ...ok, apiPortMode: 'bump' }), true)
  })

  it('rejects intentional stop / quitting / updating', () => {
    assert.equal(shouldAutoRestart({ ...ok, intentionalStop: true }), false)
    assert.equal(shouldAutoRestart({ ...ok, isQuitting: true }), false)
    assert.equal(shouldAutoRestart({ ...ok, isUpdating: true }), false)
  })

  it('rejects dev and reuse port mode', () => {
    assert.equal(shouldAutoRestart({ ...ok, isDev: true }), false)
    assert.equal(shouldAutoRestart({ ...ok, apiPortMode: 'reuse' }), false)
  })
})

describe('createBackoffState', () => {
  it('tracks failures and clears on success', () => {
    const state = createBackoffState()
    assert.equal(state.failCount, 0)
    assert.equal(recordBackoffFailure(state), 1)
    assert.equal(recordBackoffFailure(state), 2)
    resetBackoff(state)
    assert.equal(state.failCount, 0)
  })
})
