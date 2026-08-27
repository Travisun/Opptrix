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

test('resolveYahooEquityTicker maps regional stock codes', async () => {
  const { resolveYahooEquityTicker } = await import(
    '../packages/a-stock-layer/dist/providers/yfinance/symbols.js'
  )
  assert.equal(resolveYahooEquityTicker('US', 'aapl'), 'AAPL')
  assert.equal(resolveYahooEquityTicker('HK', '00700'), '0700.HK')
  assert.equal(resolveYahooEquityTicker('JP', '7203'), '7203.T')
  assert.equal(resolveYahooEquityTicker('KR', '005930'), '005930.KS')
})

test('YfinanceDriver registers equity and sector capabilities', async () => {
  const { YfinanceDriver } = await import('../packages/a-stock-layer/dist/providers/yfinance/driver.js')
  const { Capability } = await import('../packages/market-data-core/dist/core/capabilities.js')
  const driver = new YfinanceDriver()
  assert.ok(driver.capabilities().includes(Capability.STOCK_REALTIME))
  assert.ok(driver.capabilities().includes(Capability.STOCK_PROFILE))
  assert.ok(driver.capabilities().includes(Capability.SECTOR_LIST))
  const bindings = driver.bindings()
  assert.ok(bindings.some(b => b.market === 'JP' && b.assetClass === 'EQUITY'))
  assert.ok(bindings.some(b => b.market === 'KR' && b.assetClass === 'INDEX'))
})

test('resolveInstrumentQueryPlan routes JP EQUITY profile', async () => {
  const { resolveInstrumentQueryPlan } = await import(
    '../packages/a-stock-layer/dist/core/instrument-query.js'
  )
  const plan = resolveInstrumentQueryPlan(
    { market: 'JP', assetClass: 'EQUITY', symbol: '7203' },
    'profile',
  )
  assert.equal(plan?.kind, 'registry')
  if (plan?.kind === 'registry') {
    assert.equal(plan.market, 'JP')
    assert.equal(plan.method, 'profile')
  }
})

test('yahooFinanceClientQueueConfig defaults align with hostnameLimiter', async () => {
  const { resetYahooFinanceClientForTests, yahooFinanceClientQueueConfig } = await import(
    '../packages/a-stock-layer/dist/providers/yfinance/client.js'
  )
  resetYahooFinanceClientForTests()
  assert.deepEqual(yahooFinanceClientQueueConfig(), { concurrency: 1, interval: 1000 })
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

