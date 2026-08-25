import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { MarketDataEngine } from '../packages/a-stock-layer/dist/engine.js'
import { registerAllDrivers } from '../packages/a-stock-layer/dist/providers/register.js'

describe('provider catalog visibility', () => {
  it('lists built-in providers without removed or temp-offline sources', () => {
    const engine = new MarketDataEngine(false)
    engine.providerLoader.registerBuiltins()
    const catalog = engine.listProviders()
    const ids = catalog.providers.map(p => p.providerId)
    assert.ok(ids.includes('tickflow'))
    assert.ok(ids.includes('stockindex'))
    assert.ok(ids.includes('tonghuashun'))
    assert.ok(ids.includes('tushare'))
    assert.equal(ids.includes('zzshare'), false)
    assert.equal(ids.includes('baostock'), false)
    assert.equal(ids.includes('akshare'), false)
    assert.equal(ids.includes('tencent'), false)
    assert.equal(ids.includes('sinafinance'), false)
    assert.equal(ids.includes('eastmoney'), false)
  })

  it('lists recommended providers in default display order', () => {
    const engine = new MarketDataEngine(false)
    engine.providerLoader.registerBuiltins()
    const catalog = engine.listProviders()
    const ids = catalog.providers.map(p => p.providerId)
    const expected = [
      'tonghuashun',
      'stockindex',
      'tickflow',
      'tushare',
      'binance',
      'okx',
    ]
    const present = expected.filter(id => ids.includes(id))
    const positions = present.map(id => ids.indexOf(id))
    for (let i = 1; i < positions.length; i++) {
      assert.ok(
        positions[i] > positions[i - 1],
        `expected ${present[i - 1]} before ${present[i]}, got ${ids.join(' > ')}`,
      )
    }
    assert.equal(ids.indexOf('stockindex'), ids.indexOf('tonghuashun') + 1)
    assert.ok(ids.indexOf('tickflow') < ids.indexOf('tushare'))
  })

  it('keeps tonghuashun registered for fund capabilities', () => {
    const engine = new MarketDataEngine(false)
    registerAllDrivers(engine.registry)
    const driver = engine.registry.get('tonghuashun')
    assert.ok(driver)
    assert.ok(driver.bindings().length > 0)
  })
})
