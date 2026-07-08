import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  wrapCnBatchResult,
  routeInstrumentBatchSnapshots,
} from '../packages/research-hub/dist/instrument-batch-router.js'

test('wrapCnBatchResult maps legacy items to unified envelope', () => {
  const resp = wrapCnBatchResult({
    success: true,
    message: '批量快照 2 只',
    data: {
      trade_date: '2024-06-01',
      items: [
        { code: '600519', name: '贵州茅台', total_score: 82, pe: 30 },
        { code: '000001', name: '平安银行', total_score: 65, pe: 5 },
      ],
    },
  })
  assert.equal(resp.success, true)
  const data = resp.data
  assert.equal(data.count, 2)
  assert.equal(data.trade_date, '2024-06-01')
  assert.equal(data.discover_items?.length, 2)
  assert.equal(data.items?.length, 2)
  assert.deepEqual(data.discover_items, data.items)
  assert.deepEqual(data.quotes, [])
})

test('wrapCnBatchResult passes through failed responses', () => {
  const failed = { success: false, message: 'codes 必填' }
  assert.deepEqual(wrapCnBatchResult(failed), failed)
})

test('routeInstrumentBatchSnapshots legacy codes path', async () => {
  const resp = await routeInstrumentBatchSnapshots(
    { codes: ['600519', '000001'] },
    {
      cnBatchSnapshots: async symbols => ({
        success: true,
        message: `批量快照 ${symbols.length} 只`,
        data: {
          trade_date: '2024-06-01',
          items: symbols.map(code => ({ code, name: code, total_score: 70 })),
        },
      }),
    },
  )
  assert.equal(resp.success, true)
  assert.equal(resp.data.count, 2)
  assert.equal(resp.data.discover_items?.length, 2)
})

test('routeInstrumentBatchSnapshots merges CN discover rows with cross-market quotes', async () => {
  const resp = await routeInstrumentBatchSnapshots(
    {
      instruments: [
        { market: 'CN', assetClass: 'EQUITY', symbol: '600519' },
        { market: 'US', assetClass: 'EQUITY', symbol: 'AAPL' },
      ],
    },
    {
      cnBatchSnapshots: async () => ({
        success: true,
        message: '批量快照 1 只',
        data: {
          trade_date: '2024-06-01',
          items: [{ code: '600519', name: '贵州茅台', total_score: 80 }],
        },
      }),
      batchQuotesOrSnapshots: async () => ({
        success: true,
        message: '1 只行情',
        data: {
          quotes: [{
            instrument: { market: 'US', assetClass: 'EQUITY', symbol: 'AAPL' },
            code: 'AAPL',
            name: 'Apple',
            price: 190,
            change_pct: 1.2,
            volume: 1000,
            amount: null,
            market: 'US',
            asset_class: 'EQUITY',
            source: 'live',
          }],
        },
      }),
    },
  )
  assert.equal(resp.success, true)
  assert.equal(resp.data.count, 2)
  assert.equal(resp.data.discover_items?.length, 1)
  assert.equal(resp.data.quotes?.length, 1)
  assert.equal(resp.data.quotes[0]?.code, 'AAPL')
})
