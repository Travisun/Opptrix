/**
 * 关注列表 membership 变更后，Engine 应失效 watchlist 行情覆盖层缓存，
 * 避免 isWatchlistTarget 与 stock_realtime / fund_quote 条目不一致。
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { MarketDataEngine } from '@opptrix/a-stock-layer'

test('invalidateWatchlistQuoteCache clears stock_realtime and fund_quote', () => {
  const engine = new MarketDataEngine(false)

  const stockParams = { method: 'realtime', args: JSON.stringify(['600519']) }
  engine.cache.setWithTtl(
    'stock_realtime',
    [{ code: '600519', price: 1700 }],
    'realtime',
    stockParams,
    45,
    'p1',
  )
  engine.cache.setWithTtl(
    'fund_quote',
    [{ code: '000001', nav: 1.2 }],
    'fundQuote',
    { method: 'fundQuote', args: JSON.stringify(['000001']) },
    600,
    'p1',
  )
  const klineParams = { method: 'kline', args: JSON.stringify(['600519']) }
  engine.cache.setWithTtl(
    'stock_kline',
    [{ code: '600519', close: 1700 }],
    'kline',
    klineParams,
    86400,
    'p1',
  )

  const cleared = engine.invalidateWatchlistQuoteCache()
  assert.ok(cleared >= 2)
  assert.equal(engine.cache.getWithTtl('stock_realtime', 'realtime', stockParams, 45), null)
  assert.equal(
    engine.cache.getWithTtl(
      'fund_quote',
      'fundQuote',
      { method: 'fundQuote', args: JSON.stringify(['000001']) },
      600,
    ),
    null,
  )
  assert.ok(engine.cache.getWithTtl('stock_kline', 'kline', klineParams, 86400))
})
