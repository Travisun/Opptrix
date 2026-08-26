import assert from 'node:assert/strict'
import test from 'node:test'
import { routeInstrumentQuote } from '../packages/research-hub/dist/instrument-router.js'

const cnRef = { market: 'CN', assetClass: 'EQUITY', symbol: '600519' }

test('routeInstrumentQuote returns single quote from batch handler', async () => {
  const handlers = {
    stockQuotes: async (refs) => ({
      success: true,
      data: {
        quotes: [{
          instrument: refs[0],
          code: '600519',
          name: '贵州茅台',
          price: 1700,
          change_pct: 1.2,
        }],
      },
    }),
  }
  const resp = await routeInstrumentQuote({ instrument: cnRef }, handlers, Date.now())
  assert.equal(resp.success, true)
  assert.equal(resp.data.quote.price, 1700)
  assert.ok(resp.data.quote.code)
})

test('routeInstrumentQuote surfaces failure when batch empty', async () => {
  const handlers = {
    stockQuotes: async () => ({
      success: false,
      message: '行情获取失败: empty',
    }),
  }
  const resp = await routeInstrumentQuote({ instrument: cnRef }, handlers, Date.now())
  assert.equal(resp.success, false)
})
