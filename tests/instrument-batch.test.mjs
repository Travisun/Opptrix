import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  BATCH_INSTRUMENT_SNAPSHOTS_MAX,
  collectParallelCnBatchItems,
  wrapCnBatchResult,
  routeInstrumentBatchSnapshots,
} from '../packages/research-hub/dist/instrument-batch-router.js'

test('BATCH_INSTRUMENT_SNAPSHOTS_MAX is above legacy 80', () => {
  assert.equal(BATCH_INSTRUMENT_SNAPSHOTS_MAX, 200)
  assert.ok(BATCH_INSTRUMENT_SNAPSHOTS_MAX > 80)
})

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

test('wrapCnBatchResult preserves partial-failure envelope fields', () => {
  const resp = wrapCnBatchResult({
    success: true,
    message: '批量快照成功 1 只，失败 1 只',
    data: {
      trade_date: null,
      items: [{ code: '600519', name: '贵州茅台' }],
      requested_count: 2,
      attempted_count: 2,
      failed: [{ code: '000001', reason: '快照不可用' }],
    },
  })
  assert.equal(resp.success, true)
  assert.equal(resp.data.count, 1)
  assert.equal(resp.data.requested_count, 2)
  assert.equal(resp.data.attempted_count, 2)
  assert.equal(resp.data.failed?.length, 1)
  assert.equal(resp.data.failed[0]?.code, '000001')
  assert.equal(resp.data.failed[0]?.reason, '快照不可用')
})

test('wrapCnBatchResult passes through failed responses', () => {
  const failed = { success: false, message: 'codes 必填' }
  assert.deepEqual(wrapCnBatchResult(failed), failed)
})

test('collectParallelCnBatchItems keeps success order and records failures', async () => {
  const order = []
  const result = await collectParallelCnBatchItems(
    ['600519', 'bad', '000001'],
    async (code) => {
      order.push(code)
      if (code === 'bad') {
        return { success: false, message: '不存在' }
      }
      return { success: true, data: { code, name: code } }
    },
  )
  assert.equal(result.requested_count, 3)
  assert.equal(result.attempted_count, 3)
  assert.deepEqual(result.items.map(i => i.code), ['600519', '000001'])
  assert.equal(result.failed.length, 1)
  assert.equal(result.failed[0].code, 'bad')
  assert.equal(result.failed[0].reason, '不存在')
  // 全开并发：三只均已发起（顺序可能交错，但集合完整）
  assert.deepEqual([...order].sort(), ['000001', '600519', 'bad'].sort())
})

test('collectParallelCnBatchItems truncates at max and records catch as failed', async () => {
  const codes = Array.from({ length: BATCH_INSTRUMENT_SNAPSHOTS_MAX + 5 }, (_, i) =>
    String(i).padStart(6, '0'),
  )
  const result = await collectParallelCnBatchItems(
    codes,
    async (code) => {
      if (code === '000002') throw new Error('boom')
      return { success: true, data: { code } }
    },
  )
  assert.equal(result.requested_count, BATCH_INSTRUMENT_SNAPSHOTS_MAX + 5)
  assert.equal(result.attempted_count, BATCH_INSTRUMENT_SNAPSHOTS_MAX)
  assert.equal(result.items.length + result.failed.length, BATCH_INSTRUMENT_SNAPSHOTS_MAX)
  assert.ok(result.failed.some(f => f.code === '000002' && f.reason === 'boom'))
  // 成功项保持输入相对顺序（跳过失败码）
  const expectedSuccess = codes
    .slice(0, BATCH_INSTRUMENT_SNAPSHOTS_MAX)
    .filter(c => c !== '000002')
  assert.deepEqual(result.items.map(i => i.code), expectedSuccess)
})

test('collectParallelCnBatchItems all-fail still returns structured envelope', async () => {
  const result = await collectParallelCnBatchItems(
    ['a', 'b'],
    async (code) => ({ success: false, message: `fail-${code}` }),
  )
  assert.equal(result.items.length, 0)
  assert.equal(result.failed.length, 2)
  assert.equal(result.requested_count, 2)
  assert.equal(result.attempted_count, 2)
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
          requested_count: symbols.length,
          attempted_count: symbols.length,
          failed: [],
        },
      }),
    },
  )
  assert.equal(resp.success, true)
  assert.equal(resp.data.count, 2)
  assert.equal(resp.data.discover_items?.length, 2)
  assert.equal(resp.data.requested_count, 2)
  assert.equal(resp.data.attempted_count, 2)
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
        message: '批量快照成功 1 只，失败 1 只',
        data: {
          trade_date: '2024-06-01',
          items: [{ code: '600519', name: '贵州茅台', total_score: 80 }],
          requested_count: 1,
          attempted_count: 1,
          failed: [{ code: '999999', reason: '超时' }],
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
          requested_count: 1,
          attempted_count: 1,
        },
      }),
    },
  )
  assert.equal(resp.success, true)
  assert.equal(resp.data.count, 2)
  assert.equal(resp.data.discover_items?.length, 1)
  assert.equal(resp.data.quotes?.length, 1)
  assert.equal(resp.data.quotes[0]?.code, 'AAPL')
  assert.equal(resp.data.requested_count, 2)
  assert.equal(resp.data.attempted_count, 2)
  assert.equal(resp.data.failed?.length, 1)
  assert.equal(resp.data.failed[0]?.code, '999999')
})

test('routeInstrumentBatchSnapshots partial CN failure still success', async () => {
  const resp = await routeInstrumentBatchSnapshots(
    { codes: ['600519', '000000'] },
    {
      cnBatchSnapshots: async symbols => ({
        success: true,
        message: '批量快照成功 1 只，失败 1 只',
        data: {
          items: [{ code: '600519', name: '贵州茅台' }],
          requested_count: symbols.length,
          attempted_count: symbols.length,
          failed: [{ code: '000000', reason: '快照不可用' }],
        },
      }),
    },
  )
  assert.equal(resp.success, true)
  assert.equal(resp.data.count, 1)
  assert.equal(resp.data.failed?.length, 1)
  assert.equal(resp.data.requested_count, 2)
})
