/**
 * live 失败时 Engine 应能回退到覆盖层缓存（含 TTL 过期宽限内）。
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { MarketDataEngine } from '@opptrix/a-stock-layer'

test('peekInstrumentQuoteCache returns cached US stock_realtime', () => {
  const engine = new MarketDataEngine(false)
  const ref = { market: 'US', assetClass: 'EQUITY', symbol: 'AAPL' }
  const cacheParams = {
    method: 'realtime',
    market: 'US',
    assetClass: 'EQUITY',
    args: JSON.stringify(['AAPL']),
  }
  engine.cache.setWithTtl(
    'stock_realtime',
    [{ code: 'AAPL', price: 190, preClose: 188 }],
    'realtime',
    cacheParams,
    45,
    'tickflow',
  )

  const hit = engine.peekInstrumentQuoteCache(ref)
  assert.equal(hit?.price, 190)
})

test('peekInstrumentQuoteCache returns stale row after TTL expires', async () => {
  const engine = new MarketDataEngine(false)
  const ref = { market: 'US', assetClass: 'EQUITY', symbol: 'AAPL' }
  const cacheParams = {
    method: 'realtime',
    market: 'US',
    assetClass: 'EQUITY',
    args: JSON.stringify(['AAPL']),
  }
  engine.cache.setWithTtl(
    'stock_realtime',
    [{ code: 'AAPL', price: 191, preClose: 188 }],
    'realtime',
    cacheParams,
    1,
    'tickflow',
  )
  await new Promise(resolve => setTimeout(resolve, 1100))

  const hit = engine.peekInstrumentQuoteCache(ref)
  assert.equal(hit?.price, 191)
})

test('peekInstrumentQuoteCache reads CN ETF per-symbol batch cache shape', () => {
  const engine = new MarketDataEngine(false)
  engine.watchlist.replace([{
    code: '159855',
    name: '游戏 ETF',
    instrument: { market: 'CN', assetClass: 'ETF', symbol: '159855', exchange: 'SZ' },
  }])
  const ref = { market: 'CN', assetClass: 'ETF', symbol: '159855', exchange: 'SZ' }
  engine.cache.setWithTtl(
    'stock_realtime',
    [{ code: '159855', price: 1.23, exchange: 'SZ' }],
    'realtime',
    {
      method: 'realtime',
      market: 'CN',
      assetClass: 'ETF',
      args: JSON.stringify(['159855', 'SZ']),
    },
    45,
    'tonghuashun',
  )
  const hit = engine.peekInstrumentQuoteCache(ref)
  assert.equal(hit?.price, 1.23)
})

test('invalidateInstrumentQuoteCache only clears matching symbol', () => {
  const engine = new MarketDataEngine(false)
  const aaplParams = {
    method: 'realtime',
    market: 'US',
    assetClass: 'EQUITY',
    args: JSON.stringify(['AAPL']),
  }
  const msftParams = {
    method: 'realtime',
    market: 'US',
    assetClass: 'EQUITY',
    args: JSON.stringify(['MSFT']),
  }
  engine.cache.setWithTtl(
    'stock_realtime',
    [{ code: 'AAPL', price: 190 }],
    'realtime',
    aaplParams,
    45,
    'p1',
  )
  engine.cache.setWithTtl(
    'stock_realtime',
    [{ code: 'MSFT', price: 400 }],
    'realtime',
    msftParams,
    45,
    'p1',
  )

  engine.invalidateInstrumentQuoteCache({ market: 'US', assetClass: 'EQUITY', symbol: 'AAPL' })
  assert.equal(engine.cache.getWithTtl('stock_realtime', 'realtime', aaplParams, 45), null)
  assert.ok(engine.cache.getWithTtl('stock_realtime', 'realtime', msftParams, 45))
})
