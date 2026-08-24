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
  assert.equal(resp.data.detailPanelKind, 'unsupported')
  assert.equal(resp.data.capabilities.length, 0)
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
  const calls = { stockQuotes: [], usRealtime: [], regionalRealtime: [], cryptoRealtime: [] }
  const failSymbols = new Set(['000001'])
  const handlers = {
    stockQuotes: async (refs) => {
      calls.stockQuotes.push(refs.map(r => r.symbol))
      const quotes = refs
        .filter(r => !failSymbols.has(r.symbol))
        .map(r => ({ code: r.symbol, name: `name-${r.symbol}`, price: 100 }))
      return { success: true, message: 'ok', elapsed: 0, data: { quotes } }
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
  assert.ok(quoteCodes.includes('US:AAPL'))
  assert.ok(quoteCodes.includes('HK:00700'))
  assert.ok(quoteCodes.includes('CRYPTO:BINANCE.BTC/USDT'))
  assert.ok(quoteCodes.includes('CN:SH.600519'))
  assert.ok(quoteCodes.includes('CN:SH.510300'))
  assert.ok(quoteCodes.includes('CN:SZ.159915'))

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

  // CN ETF 合并为一次 stockQuotes 批量调用（个股 / ETF / 基金 各一次）
  assert.equal(calls.stockQuotes.length, 3)
  const etfCall = calls.stockQuotes.find(c => c.includes('510300') && c.includes('159915'))
  assert.ok(etfCall, 'CN ETF 应合并为一次 stockQuotes 批量调用')
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
  assert.equal(classifyQuoteFailureMessage(''), 'error')
})

test('instrument quotes: CN batch merges hub failed detail (not_found)', async () => {
  const handlers = {
    stockQuotes: async (refs) => ({
      success: true,
      message: 'ok',
      elapsed: 0,
      data: {
        quotes: [],
        failed: refs.map(r => ({ code: `CN:PF.${r.symbol}`, reason: 'not_found' })),
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
  assert.equal(failedBySymbol.get('000001').code, 'CN:PF.000001')
  assert.ok(failedBySymbol.get('000001').instrument.market === 'CN')
})

test('instrument quotes: CN whole-batch fail with not found message → reason not_found', async () => {
  const handlers = {
    stockQuotes: async () => ({
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

test('hub stockQuotes emits failed detail with not_found reason', async () => {
  const { ResearchHub } = await import('../packages/research-hub/dist/hub.js')
  const hub = new ResearchHub()
  const notFound = '所有 provider 均失败: tonghuashun: Fund not found: 000001.OF'
  hub.de.queryInstrumentData = async (ref) => {
    if (ref.symbol === '000001') {
      return { success: false, error: notFound }
    }
    return {
      success: true,
      source: 'test',
      data: [{
        code: '600519', name: '贵州茅台', price: 1700, preClose: 1680,
        changePct: 1.19, pe: 25, pb: 8, turnoverRate: 0.5,
      }],
    }
  }
  const resp = await hub.stockQuotes([
    { market: 'CN', assetClass: 'FUND', symbol: '000001' },
    { market: 'CN', assetClass: 'EQUITY', symbol: '600519' },
  ], Date.now())
  assert.equal(resp.success, true)
  assert.equal(resp.data.quotes.length, 1)
  assert.equal(resp.data.quotes[0].code, '600519')
  assert.deepEqual(resp.data.failed, [{ code: 'CN:PF.000001', reason: 'not_found' }])
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
