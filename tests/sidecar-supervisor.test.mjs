import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'

const require = createRequire(import.meta.url)
const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '..')

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

/** Keep in sync with apps/server/src/sidecar-shutdown.ts default. */
const SERVER_FORCE_EXIT_DEFAULT_MS = 12_000

describe('sidecar-supervisor constants', () => {
  it('graceful stop is ≥ server shutdown forceExit (12s) + buffer', () => {
    assert.ok(SIDECAR_GRACEFUL_MS >= SERVER_FORCE_EXIT_DEFAULT_MS)
    assert.equal(SIDECAR_GRACEFUL_MS, 14_000)
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

describe('market-duck-gateway no legacy duckdb static load', () => {
  it('gateway source has no static duck-store / duck-connection import', () => {
    const srcPath = path.join(
      repoRoot,
      'packages/market-data/src/duck/market-duck-gateway.ts',
    )
    const src = fs.readFileSync(srcPath, 'utf8')
    assert.doesNotMatch(src, /from\s+['"]\.\.\/kline\/duck-store/)
    assert.doesNotMatch(src, /from\s+['"]\.\.\/kline\/duck-connection/)
    assert.doesNotMatch(src, /from\s+['"]duckdb['"]/)
    assert.doesNotMatch(src, /resetKlineDuckStore/)
  })

  it('loading gateway module does not load legacy duckdb package entry', async () => {
    const gatewayDist = path.join(
      repoRoot,
      'packages/market-data/dist/duck/market-duck-gateway.js',
    )
    assert.ok(fs.existsSync(gatewayDist), 'build @opptrix/market-data-store first')

    function isLegacyDuckdbModuleId(id) {
      const n = id.replace(/\\/g, '/')
      // node_modules/duckdb/... but not @duckdb/node-api
      return /\/node_modules\/duckdb(\/|$)/.test(n) && !n.includes('/@duckdb/')
    }

    const before = new Set(Object.keys(require.cache).filter(isLegacyDuckdbModuleId))
    const mod = await import(pathToFileURL(gatewayDist).href)
    assert.equal(typeof mod.getMarketDuckGateway, 'function')
    assert.equal(typeof mod.closeMarketDuckRuntime, 'function')
    await mod.closeMarketDuckRuntime()

    const after = Object.keys(require.cache).filter(isLegacyDuckdbModuleId)
    const newly = after.filter((id) => !before.has(id))
    assert.deepEqual(newly, [], `unexpected legacy duckdb modules: ${newly.join(', ')}`)

    // Also assert ESM graph: no static import of duck-store / legacy duckdb
    const distSrc = fs.readFileSync(gatewayDist, 'utf8')
    assert.doesNotMatch(distSrc, /from\s+["'][^"']*kline\/duck-store/)
    assert.doesNotMatch(distSrc, /import\s*\(\s*["'][^"']*kline\/duck-store/)
    assert.doesNotMatch(distSrc, /from\s+["']duckdb["']/)
  })
})
