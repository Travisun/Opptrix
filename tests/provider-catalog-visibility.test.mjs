import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { MarketDataEngine } from '../packages/a-stock-layer/dist/engine.js'
import { registerAllDrivers } from '../packages/a-stock-layer/dist/providers/register.js'

describe('provider catalog visibility', () => {
  it('lists built-in providers without removed scraping sources', () => {
    const engine = new MarketDataEngine(false)
    engine.providerLoader.registerBuiltins()
    const catalog = engine.listProviders()
    const ids = catalog.providers.map(p => p.providerId)
    assert.ok(ids.includes('tickflow'))
    assert.ok(ids.includes('zzshare'))
    assert.ok(ids.includes('baostock'))
    assert.ok(ids.includes('tonghuashun'))
    assert.equal(ids.includes('akshare'), false)
    assert.equal(ids.includes('tencent'), false)
    assert.equal(ids.includes('sinafinance'), false)
    assert.equal(ids.includes('eastmoney'), false)
  })

  it('keeps tonghuashun registered for fund capabilities', () => {
    const engine = new MarketDataEngine(false)
    registerAllDrivers(engine.registry)
    const driver = engine.registry.get('tonghuashun')
    assert.ok(driver)
    assert.ok(driver.bindings().length > 0)
  })
})
