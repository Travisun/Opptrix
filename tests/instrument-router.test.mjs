import assert from 'node:assert/strict'
import test from 'node:test'
import {
  routeInstrumentCapabilities,
  routeInstrumentQuotes,
  routeInstrumentSearch,
} from '../packages/research-hub/dist/instrument-router.js'
import { classifyQuoteFailureMessage } from '../packages/research-hub/dist/quote-failure.js'

test('instrument capabilities marks JP equity as unsupported', () => {
  const resp = routeInstrumentCapabilities({
    instrument: { market: 'JP', assetClass: 'EQUITY', symbol: '7203' },
  })
  assert.equal(resp.success, true)
  assert.equal(resp.data.detailPanelKind, 'cross-market')
  assert.ok(resp.data.capabilities.length > 0)
})

test('instrument search delegates to local instruments handler', async () => {
  const calls = []
  const handlers = {
    stockDetail: async () => ({ success: false, message: 'skip', elapsed: 0 }),
    etfSnapshot: async () => ({ success: false, message: 'skip', elapsed: 0 }),
    usSnapshot: async () => ({ success: false, message: 'skip', elapsed: 0 }),
    cryptoSnapshot: async () => ({ success: false, message: 'skip', elapsed: 0 }),
    stockQuotes: async () => ({ success: false, message: 'skip', elapsed: 0 }),
    usRealtime: async () => ({ success: false, message: 'skip', elapsed: 0 }),
    cryptoRealtime: async () => ({ success: false, message: 'skip', elapsed: 0 }),
    stockChart: async () => ({ success: false, message: 'skip', elapsed: 0 }),
    usKline: async () => ({ success: false, message: 'skip', elapsed: 0 }),
    cryptoKline: async () => ({ success: false, message: 'skip', elapsed: 0 }),
    searchInstruments: async (keyword, limit, markets) => {
      calls.push({ keyword, limit, markets })
      return {
        success: true,
        message: 'ok',
        elapsed: 1,
        data: { items: [{ code: 'AAPL', name: 'Apple', market: 'US' }], count: 1 },
      }
    },
  }

  const resp = await routeInstrumentSearch({ keyword: 'apple', limit: 5, markets: ['US'] }, handlers)
  assert.equal(resp.success, true)
  assert.equal(calls.length, 1)
  assert.equal(calls[0].keyword, 'apple')
  assert.deepEqual(calls[0].markets, ['US'])
})

test('instrument quotes: partial success returns failed[] with precise reasons', async () => {
  const calls = { stockQuotes: [], fundQuotes: [], usRealtime: [], regionalRealtime: [], cryptoRealtime: [] }
  const failSymbols = new Set(['000001'])
  const handlers = {
    stockQuotes: async (refs) => {
      calls.stockQuotes.push(refs.map(r => r.symbol))
      const quotes = refs
        .filter(r => !failSymbols.has(r.symbol))
        .map(r => ({ code: r.symbol, name: `name-${r.symbol}`, price: 100 }))
      return { success: true, message: 'ok', elapsed: 0, data: { quotes } }
    },
    fundQuotes: async (refs) => {
      calls.fundQuotes.push(refs.map(r => r.symbol))
      const quotes = refs
        .filter(r => !failSymbols.has(r.symbol))
        .map(r => ({ code: r.symbol, name: `fund-${r.symbol}`, unitNav: 1.23, price: 1.23, instrument: r }))
      const failed = refs
        .filter(r => failSymbols.has(r.symbol))
        .map(r => ({ code: `CN:OTC:${r.symbol}.OF`, reason: 'empty' }))
      // 对齐槽位：即使全部失败也 success + failed[]，供 router 按明细归类
      return {
        success: true,
        message: quotes.length ? 'ok' : '行情获取失败',
        elapsed: 0,
        data: { quotes, failed: failed.length ? failed : undefined },
      }
    },
    usRealtime: async (symbol) => {
      calls.usRealtime.push(symbol)
      if (symbol === 'AAPL') {
        return { success: true, message: 'ok', elapsed: 0, data: { code: 'AAPL', name: 'Apple', price: 190 } }
      }
      if (symbol === 'TSLA') {
        return { success: true, message: 'ok', elapsed: 0, data: null } // Provider 返回空
      }
      return { success: false, message: '没有可用的 provider 支持 [US/EQUITY/realtime]', elapsed: 0 }
    },
    regionalRealtime: async (market, symbol) => {
      calls.regionalRealtime.push(`${market}:${symbol}`)
      return { success: true, message: 'ok', elapsed: 0, data: { code: symbol, name: `HK-${symbol}`, price: 50 } }
    },
    cryptoRealtime: async (pair) => {
      calls.cryptoRealtime.push(pair)
      if (pair.includes('ETH')) return { success: true, message: 'ok', elapsed: 0, data: null }
      return { success: true, message: 'ok', elapsed: 0, data: { code: pair, name: pair, price: 1 } }
    },
  }

  const resp = await routeInstrumentQuotes({
    instruments: [
      { market: 'US', assetClass: 'EQUITY', symbol: 'AAPL' },
      { market: 'US', assetClass: 'EQUITY', symbol: 'MSFT' },
      { market: 'US', assetClass: 'EQUITY', symbol: 'TSLA' },
      { market: 'HK', assetClass: 'EQUITY', symbol: '00700' },
      { market: 'CRYPTO', assetClass: 'CRYPTO_SPOT', symbol: 'BTC' },
      { market: 'CRYPTO', assetClass: 'CRYPTO_SPOT', symbol: 'ETH' },
      { market: 'JP', assetClass: 'EQUITY', symbol: '7203' },
      { market: 'CN', assetClass: 'EQUITY', symbol: '600519' },
      { market: 'CN', symbol: '510300' },
      { market: 'CN', symbol: '159915' },
      { market: 'CN', assetClass: 'FUND', symbol: '000001' },
    ],
  }, handlers)

  // 部分成功仍 success:true，且 quotes 覆盖所有成功 ref
  assert.equal(resp.success, true)
  const quoteCodes = resp.data.quotes.map(q => q.code).sort()
  assert.equal(resp.data.quotes.length, 6)
  assert.ok(quoteCodes.includes('US:STOCK:AAPL.US'))
  assert.ok(quoteCodes.includes('HK:STOCK:00700.HK'))
  assert.ok(quoteCodes.includes('CRYPTO:BINANCE.BTC/USDT'))
  assert.ok(quoteCodes.includes('CN:STOCK:600519.SH'))
  assert.ok(quoteCodes.includes('CN:ETF:510300.SH'))
  assert.ok(quoteCodes.includes('CN:ETF:159915.SZ'))

  // failed[] 只含失败/跳过 ref，reason 归类精确
  assert.equal(resp.data.failed.length, 5)
  const failedBySymbol = new Map(resp.data.failed.map(f => [f.instrument.symbol, f]))
  assert.equal(failedBySymbol.get('MSFT').reason, 'no_provider')
  assert.equal(failedBySymbol.get('TSLA').reason, 'empty')
  assert.equal(failedBySymbol.get('ETH').reason, 'empty')
  assert.equal(failedBySymbol.get('7203').reason, 'unsupported')
  assert.equal(failedBySymbol.get('000001').reason, 'empty')
  for (const f of resp.data.failed) {
    assert.ok(typeof f.code === 'string' && f.code.length > 0, 'failed.code 应存在')
    assert.ok(f.instrument && f.instrument.market, 'failed.instrument 应为 normalizeInstrumentRef')
  }

  // CN 个股 / ETF 各一次 stockQuotes；FUND 走 fundQuotes，不进 stockQuotes
  assert.equal(calls.stockQuotes.length, 2)
  assert.equal(calls.fundQuotes.length, 1)
  assert.deepEqual(calls.fundQuotes[0], ['000001'])
  const etfCall = calls.stockQuotes.find(c => c.includes('510300') && c.includes('159915'))
  assert.ok(etfCall, 'CN ETF 应合并为一次 stockQuotes 批量调用')
  const equityCall = calls.stockQuotes.find(c => c.includes('600519'))
  assert.ok(equityCall, 'CN EQUITY 应走 stockQuotes')
  assert.ok(!calls.stockQuotes.some(c => c.includes('000001')), 'FUND 不得走 stockQuotes')
  assert.equal(calls.usRealtime.length, 3)
  assert.equal(calls.regionalRealtime.length, 1)
  assert.equal(calls.cryptoRealtime.length, 2)
})

test('classifyQuoteFailureMessage maps not found / no provider / other', () => {
  assert.equal(classifyQuoteFailureMessage('所有 provider 均失败: tonghuashun: Fund not found: 000001.OF'), 'not_found')
  assert.equal(classifyQuoteFailureMessage('同花顺 API code=3001: Fund not found: 000001.OF'), 'not_found')
  assert.equal(classifyQuoteFailureMessage('Fund not found'), 'not_found')
  assert.equal(classifyQuoteFailureMessage('没有可用的 provider 支持 [CN/FUND/fundQuote]'), 'no_provider')
  assert.equal(classifyQuoteFailureMessage('tushare: 暂无数据'), 'no_provider')
  assert.equal(classifyQuoteFailureMessage('所有 provider 均失败: tushare: 空数据'), 'error')
  assert.equal(classifyQuoteFailureMessage('tickflow: 熔断中 (连续失败3次, 30s后重试)'), 'error')
  assert.equal(classifyQuoteFailureMessage('tonghuashun: 限流冷却中'), 'error')
  assert.equal(classifyQuoteFailureMessage(''), 'error')
})

test('instrument quotes: FUND uses fundQuotes; never stockQuotes', async () => {
  const calls = { stockQuotes: 0, fundQuotes: 0 }
  const handlers = {
    stockQuotes: async () => {
      calls.stockQuotes += 1
      return { success: false, message: 'should not call stockQuotes for FUND', elapsed: 0 }
    },
    fundQuotes: async (refs) => {
      calls.fundQuotes += 1
      return {
        success: true,
        message: 'ok',
        elapsed: 0,
        data: {
          quotes: refs.map(r => ({
            code: r.symbol,
            name: `基金${r.symbol}`,
            unitNav: 1.05,
            price: 1.05,
            changePct: 0.12,
            instrument: r,
          })),
        },
      }
    },
    usRealtime: async () => ({ success: false, message: 'skip', elapsed: 0 }),
  }
  const resp = await routeInstrumentQuotes({
    instruments: [
      { market: 'CN', assetClass: 'FUND', symbol: '110022' },
      { market: 'CN', assetClass: 'FUND', symbol: '000001' },
    ],
  }, handlers)
  assert.equal(resp.success, true)
  assert.equal(calls.stockQuotes, 0)
  assert.equal(calls.fundQuotes, 1)
  assert.equal(resp.data.quotes.length, 2)
  assert.equal(resp.data.quotes[0].price, 1.05)
  assert.ok(resp.data.quotes.every(q => q.asset_class === 'FUND'))
})

test('instrument quotes: fundQuotes partial fail → failed[]; unitNav as price', async () => {
  const handlers = {
    stockQuotes: async () => ({ success: false, message: 'should not', elapsed: 0 }),
    fundQuotes: async (refs) => ({
      success: true,
      message: 'ok',
      elapsed: 0,
      data: {
        quotes: [{
          code: '110022',
          name: '易方达消费',
          unitNav: 2.34,
          changePct: -0.5,
          instrument: refs[0],
        }],
        failed: [{ code: 'CN:OTC:000001.OF', reason: 'not_found' }],
      },
    }),
  }
  const resp = await routeInstrumentQuotes({
    instruments: [
      { market: 'CN', assetClass: 'FUND', symbol: '110022' },
      { market: 'CN', assetClass: 'FUND', symbol: '000001' },
    ],
  }, handlers)
  assert.equal(resp.success, true)
  assert.equal(resp.data.quotes.length, 1)
  assert.equal(resp.data.quotes[0].price, 2.34)
  assert.equal(resp.data.failed.length, 1)
  assert.equal(resp.data.failed[0].instrument.symbol, '000001')
  assert.equal(resp.data.failed[0].reason, 'not_found')
})

test('instrument quotes: CN fundQuotes merges hub failed detail (not_found)', async () => {
  const handlers = {
    stockQuotes: async () => ({ success: false, message: 'should not', elapsed: 0 }),
    fundQuotes: async (refs) => ({
      success: true,
      message: 'ok',
      elapsed: 0,
      data: {
        quotes: [],
        failed: refs.map(r => ({ code: `CN:OTC:${r.symbol}.OF`, reason: 'not_found' })),
      },
    }),
    usRealtime: async (symbol) => ({
      success: true, message: 'ok', elapsed: 0,
      data: { code: symbol, name: 'Apple', price: 190 },
    }),
  }
  const resp = await routeInstrumentQuotes({
    instruments: [
      { market: 'US', assetClass: 'EQUITY', symbol: 'AAPL' },
      { market: 'CN', assetClass: 'FUND', symbol: '000001' },
      { market: 'CN', assetClass: 'FUND', symbol: '000008' },
    ],
  }, handlers)
  assert.equal(resp.success, true)
  assert.equal(resp.data.quotes.length, 1)
  const failedBySymbol = new Map(resp.data.failed.map(f => [f.instrument.symbol, f]))
  assert.equal(failedBySymbol.get('000001').reason, 'not_found')
  assert.equal(failedBySymbol.get('000008').reason, 'not_found')
  assert.equal(failedBySymbol.get('000001').code, 'CN:OTC:000001.OF')
  assert.ok(failedBySymbol.get('000001').instrument.market === 'CN')
})

test('instrument quotes: CN fund whole-batch fail with not found message → reason not_found', async () => {
  const handlers = {
    stockQuotes: async () => ({ success: false, message: 'should not', elapsed: 0 }),
    fundQuotes: async () => ({
      success: false,
      message: '所有 provider 均失败: tonghuashun: Fund not found: 000001.OF',
      elapsed: 0,
    }),
    usRealtime: async (symbol) => ({
      success: true, message: 'ok', elapsed: 0,
      data: { code: symbol, name: 'Apple', price: 190 },
    }),
  }
  const resp = await routeInstrumentQuotes({
    instruments: [
      { market: 'US', assetClass: 'EQUITY', symbol: 'AAPL' },
      { market: 'CN', assetClass: 'FUND', symbol: '000001' },
    ],
  }, handlers)
  assert.equal(resp.success, true)
  const fundFailed = resp.data.failed.find(f => f.instrument.symbol === '000001')
  assert.equal(fundFailed.reason, 'not_found')
})

test('hub stockQuotes uses engine batchRealtime once; sparse miss → failed empty', async () => {
  const { ResearchHub } = await import('../packages/research-hub/dist/hub.js')
  const hub = new ResearchHub()
  let batchCalls = 0
  let realtimeCalls = 0
  hub.de.batchRealtime = async (codes) => {
    batchCalls += 1
    assert.deepEqual([...codes].sort(), ['000001', '600519'])
    return {
      success: true,
      source: 'test',
      // 稀疏：仅返回 600519，且顺序与请求不一致
      data: [{
        code: '600519', name: '贵州茅台', price: 1700, preClose: 1680,
        changePct: 1.19, pe: 25, pb: 8, turnoverRate: 0.5, exchange: 'SH',
      }],
    }
  }
  hub.de.queryInstrumentData = async () => {
    realtimeCalls += 1
    return { success: false, error: 'should not per-symbol realtime' }
  }
  const resp = await hub.stockQuotes([
    { market: 'CN', assetClass: 'EQUITY', symbol: '000001' },
    { market: 'CN', assetClass: 'EQUITY', symbol: '600519' },
  ], Date.now())
  assert.equal(resp.success, true)
  assert.equal(batchCalls, 1)
  assert.equal(realtimeCalls, 0)
  assert.equal(resp.data.quotes.length, 1)
  assert.equal(resp.data.quotes[0].code, 'CN:STOCK:600519.SH')
  assert.deepEqual(resp.data.failed, [{ code: 'CN:STOCK:000001.SZ', reason: 'empty' }])
})

test('hub fundQuotes maps unitNav to price; partial fail → failed', async () => {
  const prevKey = process.env.OPPTRIX_STOCKINDEX_API_KEY
  delete process.env.OPPTRIX_STOCKINDEX_API_KEY
  try {
  const { ResearchHub } = await import('../packages/research-hub/dist/hub.js')
  const hub = new ResearchHub()
  const seen = []
  hub.de.queryInstrumentData = async (ref, cap) => {
    seen.push({ symbol: ref.symbol, cap })
    assert.equal(cap, 'fund_quote')
    if (ref.symbol === '000001') {
      return { success: false, error: 'tonghuashun: Fund not found: 000001.OF' }
    }
    return {
      success: true,
      data: [{ code: ref.symbol, name: '易方达消费', unitNav: 1.88, changePct: 0.3 }],
    }
  }
  const resp = await hub.fundQuotes([
    { market: 'CN', assetClass: 'FUND', symbol: '110022' },
    { market: 'CN', assetClass: 'FUND', symbol: '000001' },
  ], Date.now())
  assert.equal(resp.success, true)
  assert.equal(seen.length, 2)
  assert.equal(resp.data.quotes.length, 1)
  assert.equal(resp.data.quotes[0].price, 1.88)
  assert.equal(resp.data.quotes[0].unitNav, 1.88)
  assert.deepEqual(resp.data.failed, [{ code: 'CN:OTC:000001.OF', reason: 'not_found' }])
  } finally {
    if (prevKey != null) process.env.OPPTRIX_STOCKINDEX_API_KEY = prevKey
  }
})

test('hub stockQuotes all-miss via batchRealtime → fail', async () => {
  const { ResearchHub } = await import('../packages/research-hub/dist/hub.js')
  const hub = new ResearchHub()
  hub.de.batchRealtime = async () => ({
    success: false,
    error: '所有 provider 均失败: tonghuashun: Fund not found: 000001.OF',
  })
  const resp = await hub.stockQuotes([
    { market: 'CN', assetClass: 'EQUITY', symbol: '600519' },
  ], Date.now())
  assert.equal(resp.success, false)
  assert.match(String(resp.message), /not found/i)
})

test('instrument quotes: all refs failed still returns fail', async () => {
  const handlers = {
    stockQuotes: async () => ({ success: false, message: '行情获取失败', elapsed: 0 }),
    usRealtime: async () => ({ success: false, message: '行情获取失败', elapsed: 0 }),
    regionalRealtime: async () => ({ success: false, message: '行情获取失败', elapsed: 0 }),
    cryptoRealtime: async () => ({ success: false, message: '行情获取失败', elapsed: 0 }),
  }
  const resp = await routeInstrumentQuotes({
    instruments: [
      { market: 'US', assetClass: 'EQUITY', symbol: 'AAPL' },
      { market: 'CN', symbol: '510300' },
    ],
  }, handlers)
  assert.equal(resp.success, false)
  assert.equal(resp.message, '行情获取失败')
  assert.equal(typeof resp.elapsed, 'number')
})

test('instrument quotes: all-fail preserves first upstream error (circuit)', async () => {
  const handlers = {
    stockQuotes: async () => ({
      success: false,
      message: '行情获取失败: tickflow: 熔断中 (连续失败3次, 30s后重试)',
      elapsed: 0.01,
    }),
  }
  const t0 = Date.now()
  const resp = await routeInstrumentQuotes({
    instruments: [
      { market: 'CN', assetClass: 'EQUITY', symbol: '600519' },
    ],
  }, handlers, t0)
  assert.equal(resp.success, false)
  assert.match(resp.message, /熔断中/)
  assert.equal(typeof resp.elapsed, 'number')
  assert.equal(classifyQuoteFailureMessage(resp.message), 'error')
})

test('instrument quotes: US group bounded concurrency ≤ 5', async () => {
  const symbols = Array.from({ length: 12 }, (_, i) => `T${String(i + 1).padStart(2, '0')}`)
  let inFlight = 0
  let maxInFlight = 0
  const handlers = {
    usRealtime: async (symbol) => {
      inFlight += 1
      maxInFlight = Math.max(maxInFlight, inFlight)
      await new Promise(resolve => setTimeout(resolve, 5))
      inFlight -= 1
      return { success: true, message: 'ok', elapsed: 0, data: { code: symbol, price: 1 } }
    },
  }
  const resp = await routeInstrumentQuotes({
    instruments: symbols.map(symbol => ({ market: 'US', assetClass: 'EQUITY', symbol })),
  }, handlers)
  assert.equal(resp.success, true)
  assert.equal(resp.data.quotes.length, 12)
  assert.ok(maxInFlight <= 5, `US 组并发应 ≤5，实际 ${maxInFlight}`)
})

test('instrument quotes: usQuotes batch path preferred over per-symbol usRealtime', async () => {
  const calls = { usQuotes: 0, usRealtime: 0 }
  const handlers = {
    stockQuotes: async () => ({ success: true, message: 'ok', elapsed: 0, data: { quotes: [] } }),
    usRealtime: async (symbol) => {
      calls.usRealtime += 1
      return { success: true, message: 'ok', elapsed: 0, data: { code: symbol, price: 1 } }
    },
    regionalRealtime: async () => ({ success: false, message: 'skip', elapsed: 0 }),
    cryptoRealtime: async () => ({ success: false, message: 'skip', elapsed: 0 }),
    usQuotes: async (refs) => {
      calls.usQuotes += 1
      return {
        success: true,
        message: 'ok',
        elapsed: 0,
        data: {
          quotes: refs.map(r => ({ code: r.symbol, name: r.symbol, price: 100, instrument: r })),
        },
      }
    },
  }
  const resp = await routeInstrumentQuotes({
    instruments: [
      { market: 'US', assetClass: 'EQUITY', symbol: 'AAPL' },
      { market: 'US', assetClass: 'EQUITY', symbol: 'MSFT' },
      { market: 'US', assetClass: 'EQUITY', symbol: 'GOOG' },
    ],
  }, handlers)
  assert.equal(resp.success, true)
  assert.equal(resp.data.quotes.length, 3)
  assert.equal(calls.usQuotes, 1)
  assert.equal(calls.usRealtime, 0)
})

test('instrument quotes: CN stockQuotes fail does not drop US quotes', async () => {
  const handlers = {
    stockQuotes: async () => ({
      success: false,
      message: '行情获取失败: tickflow: 熔断中',
      elapsed: 0,
    }),
    usQuotes: async (refs) => ({
      success: true,
      message: 'ok',
      elapsed: 0,
      data: {
        quotes: refs.map(r => ({ code: r.symbol, name: r.symbol, price: 100, instrument: r })),
      },
    }),
    usRealtime: async () => ({ success: false, message: 'skip', elapsed: 0 }),
    regionalRealtime: async () => ({ success: false, message: 'skip', elapsed: 0 }),
    cryptoRealtime: async () => ({ success: false, message: 'skip', elapsed: 0 }),
  }
  const resp = await routeInstrumentQuotes({
    instruments: [
      { market: 'CN', assetClass: 'EQUITY', symbol: '600519' },
      { market: 'US', assetClass: 'EQUITY', symbol: 'AAPL' },
    ],
  }, handlers)
  assert.equal(resp.success, true)
  assert.equal(resp.data.quotes.length, 1)
  assert.equal(resp.data.quotes[0].instrument.symbol, 'AAPL')
  const cnFailed = resp.data.failed.find(f => f.instrument.symbol === '600519')
  assert.ok(cnFailed)
  assert.equal(cnFailed.reason, 'error')
})
