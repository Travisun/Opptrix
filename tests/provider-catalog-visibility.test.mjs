import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { MarketDataEngine } from '../packages/a-stock-layer/dist/engine.js'
import { registerAllDrivers } from '../packages/a-stock-layer/dist/providers/register.js'

describe('provider catalog visibility', () => {
  it('excludes akshare from settings catalog (no market bindings)', () => {
    const engine = new MarketDataEngine(false)
    engine.providerLoader.registerBuiltins()
    const catalog = engine.listProviders()
    const ids = catalog.providers.map(p => p.providerId)
    assert.ok(!ids.includes('akshare'), `akshare should be hidden, got: ${ids.join(', ')}`)
    assert.ok(ids.includes('tickflow'))
    assert.ok(ids.includes('zzshare'))
  })

  it('keeps akshare registered for custom methods', () => {
    const engine = new MarketDataEngine(false)
    registerAllDrivers(engine.registry)
    const driver = engine.registry.get('akshare')
    assert.ok(driver)
    assert.equal(driver.bindings().length, 0)
  })
})
