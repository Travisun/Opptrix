import assert from 'node:assert/strict'
import test from 'node:test'
import {
  routeInstrumentCapabilities,
  routeInstrumentSearch,
} from '../packages/research-hub/dist/instrument-router.js'

test('instrument capabilities resolves JP equity batch quote', () => {
  const resp = routeInstrumentCapabilities({
    instrument: { market: 'JP', assetClass: 'EQUITY', symbol: '7203' },
  })
  assert.equal(resp.success, true)
  assert.ok(resp.data.capabilities.includes('batch_quote'))
  assert.equal(resp.data.detailPanelKind, 'cross-market')
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
    searchLocalInstruments: async (keyword, limit, markets) => {
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
