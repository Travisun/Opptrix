import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

let dataDir = ''

before(async () => {
  dataDir = await mkdtemp(join(tmpdir(), 'opptrix-free-throttle-'))
  process.env.OPPTRIX_DATA_DIR = dataDir
})

after(async () => {
  const { getUserDataStore } = await import('../packages/user-store/dist/index.js')
  const { resetFreeProviderThrottleSingleton } = await import('../packages/a-stock-layer/dist/core/free-provider-throttle.js')
  getUserDataStore().close()
  resetFreeProviderThrottleSingleton()
  if (dataDir) await rm(dataDir, { recursive: true, force: true })
})

describe('free provider throttle persistence', () => {
  it('escalates cooldown on trigger and resets on success', async () => {
    const { MarketDataEngine } = await import('../packages/a-stock-layer/dist/engine.js')
    const { getFreeProviderThrottle, resetFreeProviderThrottleSingleton } = await import('../packages/a-stock-layer/dist/core/free-provider-throttle.js')
    const { FREE_PROVIDER_EMPTY_BODY_REASON } = await import('@opptrix/shared')
    const engine = new MarketDataEngine(false)
    engine.providerLoader.registerBuiltins()
    resetFreeProviderThrottleSingleton()
    const throttle = getFreeProviderThrottle()

    const first = throttle.recordTrigger('baostock', 'HTTP 429')
    assert.ok(first)
    assert.equal(first.escalationLevel, 1)
    assert.ok(throttle.shouldSkip('baostock').skip)

    throttle.recordSuccess('baostock')
    assert.equal(throttle.shouldSkip('baostock').skip, false)
    const state = throttle.getState('baostock')
    assert.equal(state?.escalationLevel, 0)
    assert.equal(state?.cooldownUntil, 0)
  })

  it('keeps logs across repository reload', async () => {
    const { MarketDataEngine } = await import('../packages/a-stock-layer/dist/engine.js')
    const { getUserDataStore } = await import('../packages/user-store/dist/index.js')
    const { getFreeProviderThrottle, resetFreeProviderThrottleSingleton } = await import('../packages/a-stock-layer/dist/core/free-provider-throttle.js')
    const { FREE_PROVIDER_EMPTY_BODY_REASON } = await import('@opptrix/shared')
    const engine = new MarketDataEngine(false)
    engine.providerLoader.registerBuiltins()
    resetFreeProviderThrottleSingleton()
    const throttle = getFreeProviderThrottle()
    throttle.recordTrigger('zzshare', FREE_PROVIDER_EMPTY_BODY_REASON)
    const logsBefore = throttle.listLogs('zzshare', 5)
    assert.ok(logsBefore.length >= 1)

    getUserDataStore().close()
    resetFreeProviderThrottleSingleton()
    const throttle2 = getFreeProviderThrottle()
    const state = throttle2.getState('zzshare')
    assert.ok(state && state.escalationLevel >= 1)
    const logsAfter = throttle2.listLogs('zzshare', 5)
    assert.ok(logsAfter.length >= 1)
  })
})
