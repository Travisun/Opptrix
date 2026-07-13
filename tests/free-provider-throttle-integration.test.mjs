import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

let dataDir = ''

before(async () => {
  dataDir = await mkdtemp(join(tmpdir(), 'opptrix-free-throttle-int-'))
  process.env.OPPTRIX_DATA_DIR = dataDir
})

after(async () => {
  const { getUserDataStore } = await import('../packages/user-store/dist/index.js')
  const {
    resetFreeProviderThrottleSingleton,
  } = await import('../packages/a-stock-layer/dist/core/free-provider-throttle.js')
  getUserDataStore().close()
  resetFreeProviderThrottleSingleton()
  if (dataDir) await rm(dataDir, { recursive: true, force: true })
})

async function bootEngine() {
  const { MarketDataEngine } = await import('../packages/a-stock-layer/dist/engine.js')
  const { getProviderConfigStore } = await import('../packages/a-stock-layer/dist/providers/config-store.js')
  const {
    getFreeProviderThrottle,
    resetFreeProviderThrottleSingleton,
  } = await import('../packages/a-stock-layer/dist/core/free-provider-throttle.js')
  const engine = new MarketDataEngine(false)
  engine.providerLoader.registerBuiltins()
  resetFreeProviderThrottleSingleton()
  getFreeProviderThrottle().reset()

  const configStore = getProviderConfigStore()
  for (const id of engine.registry.listDrivers()) {
    if (id === 'baostock') {
      configStore.save(id, { enabled: true })
    } else {
      configStore.save(id, { enabled: false })
    }
  }
  engine.registry.refreshPriorities(configStore)

  return { engine, throttle: getFreeProviderThrottle(), configStore }
}

describe('free provider throttle — engine integration', () => {
  it('queryInstrumentData triggers cooldown on HTTP 429 and skips while cooling', async () => {
    const { engine, throttle } = await bootEngine()
    const driver = engine.registry.get('baostock')
    assert.ok(driver)
    const original = driver.kline.bind(driver)
    let calls = 0
    driver.kline = async () => {
      calls += 1
      throw new Error('HTTP 429')
    }

    try {
      const first = await engine.queryInstrumentData(
        { market: 'CN', assetClass: 'EQUITY', symbol: '600519' },
        'kline',
        { count: 10 },
      )
      assert.equal(first.success, false)

      const state = throttle.getState('baostock')
      assert.ok(state && state.escalationLevel >= 1, 'should escalate after 429')
      assert.ok(throttle.shouldSkip('baostock').skip, 'should skip during cooldown')

      const second = await engine.queryInstrumentData(
        { market: 'CN', assetClass: 'EQUITY', symbol: '600519' },
        'kline',
        { count: 10 },
      )
      assert.equal(second.success, false)
      assert.equal(calls, 1, 'cooled provider must not be called again in same window')
    } finally {
      driver.kline = original
    }
  })

  it('empty kline rows do not trigger free-provider long cooldown', async () => {
    const { engine, throttle } = await bootEngine()
    const driver = engine.registry.get('baostock')
    assert.ok(driver)
    const original = driver.kline.bind(driver)
    driver.kline = async () => []

    try {
      await engine.queryInstrumentData(
        { market: 'CN', assetClass: 'EQUITY', symbol: '600519' },
        'kline',
        { count: 10 },
      )
      const state = throttle.getState('baostock')
      assert.equal(state?.escalationLevel ?? 0, 0)
      assert.equal(throttle.shouldSkip('baostock').skip, false)
    } finally {
      driver.kline = original
    }
  })

  it('successful baostock response clears throttle state', async () => {
    const { throttle } = await bootEngine()
    throttle.recordTrigger('baostock', 'HTTP 403')
    assert.ok(throttle.shouldSkip('baostock').skip)
    throttle.recordSuccess('baostock')
    assert.equal(throttle.getState('baostock')?.escalationLevel ?? 0, 0)
    assert.equal(throttle.shouldSkip('baostock').skip, false)
  })

  it('invokeProviderDriverMethod respects cooldown for hub detail fallback', async () => {
    const { throttle } = await bootEngine()
    const { invokeProviderDriverMethod } = await import('../packages/a-stock-layer/dist/core/provider-driver-guard.js')
    throttle.recordTrigger('sinafinance', 'HTTP 502')

    let called = false
    const rows = await invokeProviderDriverMethod(
      'sinafinance',
      'detail:shareholders',
      async () => {
        called = true
        return [{ x: 1 }]
      },
    )
    assert.equal(rows, null)
    assert.equal(called, false, 'must not invoke driver while in cooldown')
  })

  it('empty HTTP body triggers free-provider throttle signal', async () => {
    const {
      FREE_PROVIDER_EMPTY_BODY_REASON,
      isEmptyHttpResponseBody,
      isFreeProviderThrottleTrigger,
    } = await import('@opptrix/shared')

    assert.equal(isEmptyHttpResponseBody(''), true)
    assert.equal(isEmptyHttpResponseBody('  \n  '), true)
    assert.equal(isEmptyHttpResponseBody('[]'), false)

    const verdict = isFreeProviderThrottleTrigger(new Error(FREE_PROVIDER_EMPTY_BODY_REASON))
    assert.equal(verdict.trigger, true)
    assert.equal(verdict.reason, FREE_PROVIDER_EMPTY_BODY_REASON)
  })
})
