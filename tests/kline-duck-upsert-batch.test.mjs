/**
 * KlineDuckStore.upsertBatch — 大批量写入正确性 + 幂等覆盖（PK trade_date, code）
 */
import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

describe('KlineDuckStore upsertBatch fast path', () => {
  /** @type {string} */
  let tmpDir
  /** @type {string} */
  let duckPath
  /** @type {import('../packages/market-data/dist/kline/duck-store.js').KlineDuckStore} */
  let store

  before(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opptrix-kline-batch-'))
    duckPath = path.join(tmpDir, 'test-kline.duckdb')
    const { KlineDuckStore } = await import('../packages/market-data/dist/kline/duck-store.js')
    store = new KlineDuckStore(duckPath)
  })

  after(async () => {
    try {
      await store?.close()
    } catch { /* ignore */ }
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    } catch { /* ignore */ }
  })

  it('writes N rows in one batch and count matches', async () => {
    const N = 2_500
    const rows = []
    for (let i = 0; i < N; i++) {
      const day = 1 + (i % 28)
      const code = String(600000 + (i % 100)).padStart(6, '0')
      rows.push({
        tradeDate: `2024-01-${String(day).padStart(2, '0')}`,
        code,
        open: 10 + (i % 5),
        high: 11 + (i % 5),
        low: 9 + (i % 5),
        close: 10.5 + (i % 5),
        volume: 1000 + i,
        amount: 1e6 + i,
        changePct: (i % 7) * 0.1,
      })
    }
    // 同 PK 可能重复，最终行数 = 唯一 (trade_date, code)
    const unique = new Set(rows.map(r => `${r.tradeDate}\0${r.code}`))
    const written = await store.upsertBatch(rows, '2024-01-01T00:00:00.000Z')
    assert.equal(written, N)
    const count = await store.countRows()
    assert.equal(count, unique.size)
  })

  it('repeat upsert is idempotent (no row growth) and last write wins', async () => {
    const keyRows = [
      {
        tradeDate: '2024-06-01',
        code: '600519',
        open: 100,
        high: 110,
        low: 99,
        close: 105,
        volume: 1,
        amount: 100,
        changePct: 1,
      },
      {
        tradeDate: '2024-06-02',
        code: '600519',
        open: 105,
        high: 112,
        low: 104,
        close: 110,
        volume: 2,
        amount: 200,
        changePct: 2,
      },
    ]
    const before = await store.countRows()
    await store.upsertBatch(keyRows, '2024-06-01T12:00:00.000Z')
    const mid = await store.countRows()
    assert.equal(mid, before + 2)

    const overlay = [
      {
        tradeDate: '2024-06-01',
        code: '600519',
        open: 200,
        high: 210,
        low: 199,
        close: 205,
        volume: 9,
        amount: 900,
        changePct: 9.9,
      },
    ]
    await store.upsertBatch(overlay, '2024-06-01T13:00:00.000Z')
    const after = await store.countRows()
    assert.equal(after, mid, 'repeat upsert must not grow row count')

    const bars = await store.queryDailyKlines('600519', 10)
    const d1 = bars.find(b => b.date === '2024-06-01' || b.date?.startsWith('2024-06-01'))
    assert.ok(d1, 'expected bar for 2024-06-01')
    assert.equal(d1.close, 205)
    assert.equal(d1.changePct, 9.9)
  })
})
