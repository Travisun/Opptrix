import assert from 'node:assert/strict'
import { test } from 'node:test'

test('resolveYfinanceGlobalIndex maps aliases to Yahoo tickers', async () => {
  const { resolveYfinanceGlobalIndex, resolveYahooIndexTicker } = await import(
    '../packages/a-stock-layer/dist/providers/yfinance/symbols.js'
  )
  assert.equal(resolveYfinanceGlobalIndex('spx')?.yahoo, '^GSPC')
  assert.equal(resolveYfinanceGlobalIndex('^HSI')?.outCode, 'HSI')
  assert.equal(resolveYahooIndexTicker('US', 'SPX'), '^GSPC')
  assert.equal(resolveYahooIndexTicker('HK', 'HSI'), '^HSI')
  assert.equal(resolveYahooIndexTicker('JP', 'N225'), '^N225')
})

test('YfinanceDriver registers global index capabilities', async () => {
  const { YfinanceDriver } = await import('../packages/a-stock-layer/dist/providers/yfinance/driver.js')
  const { Capability } = await import('../packages/market-data-core/dist/core/capabilities.js')
  const driver = new YfinanceDriver()
  assert.equal(driver.name, 'yfinance')
  assert.ok(driver.capabilities().includes(Capability.GLOBAL_INDEX))
  assert.ok(driver.capabilities().includes(Capability.INDEX_REALTIME))
  const bindings = driver.bindings()
  assert.ok(bindings.some(b => b.capability === Capability.GLOBAL_INDEX))
  assert.ok(bindings.some(b => b.market === 'US' && b.assetClass === 'INDEX'))
})

test('resolveInstrumentQueryPlan routes US INDEX kline to yfinance binding', async () => {
  const { resolveInstrumentQueryPlan } = await import(
    '../packages/a-stock-layer/dist/core/instrument-query.js'
  )
  const plan = resolveInstrumentQueryPlan(
    { market: 'US', assetClass: 'INDEX', symbol: '^GSPC' },
    'kline',
    { count: 120 },
  )
  assert.equal(plan?.kind, 'registry')
  if (plan?.kind === 'registry') {
    assert.equal(plan.market, 'US')
    assert.equal(plan.assetClass, 'INDEX')
    assert.equal(plan.method, 'indexKline')
  }
})
