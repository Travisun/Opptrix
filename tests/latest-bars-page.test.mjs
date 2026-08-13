/**
 * latestBars / latestBarSnapshot 分页：拼回 ≡ 全量；游标无丢无重。
 */
import { describe, it, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'

const dir = mkdtempSync(join(tmpdir(), 'opptrix-latest-bars-page-'))
const duckPath = join(dir, 'kline.duckdb')

const { KlineDuckStore } = await import(
  pathToFileURL(join(process.cwd(), 'packages/market-data/dist/kline/duck-store.js')).href
)
const {
  buildLatestBarsPageQuery,
  clampLatestBarsPageLimit,
  resolveLatestBarsPageLimit,
  stitchLatestBarsPages,
  LATEST_BARS_PAGE_LOW_MEM_LIMIT,
} = await import(
  pathToFileURL(join(process.cwd(), 'packages/market-data/dist/duck/latest-bars-page.js')).href
)

after(() => {
  try {
    rmSync(dir, { recursive: true, force: true })
  } catch {
    /* ignore */
  }
})

function sortKey(rows) {
  return [...rows].sort((a, b) => String(a.code).localeCompare(String(b.code)))
}

function rowKey(r) {
  return `${r.code}\0${r.close}\0${r.change_pct}`
}

describe('latestBarsPage helpers', () => {
  it('clamps limit to 1..2000 with default 1000', () => {
    assert.equal(clampLatestBarsPageLimit(), 1000)
    assert.equal(clampLatestBarsPageLimit(0), 1)
    assert.equal(clampLatestBarsPageLimit(500), 500)
    assert.equal(clampLatestBarsPageLimit(9999), 2000)
  })

  it('resolveLatestBarsPageLimit respects lowMem and env', () => {
    const prev = process.env.OPPTRIX_LATEST_BARS_PAGE_LIMIT
    delete process.env.OPPTRIX_LATEST_BARS_PAGE_LIMIT
    assert.equal(resolveLatestBarsPageLimit({ lowMem: true }), LATEST_BARS_PAGE_LOW_MEM_LIMIT)
    assert.equal(resolveLatestBarsPageLimit({ limit: 120 }), 120)
    process.env.OPPTRIX_LATEST_BARS_PAGE_LIMIT = '250'
    assert.equal(resolveLatestBarsPageLimit(), 250)
    if (prev == null) delete process.env.OPPTRIX_LATEST_BARS_PAGE_LIMIT
    else process.env.OPPTRIX_LATEST_BARS_PAGE_LIMIT = prev
  })

  it('builds tradeDate + afterCode SQL', () => {
    const { sql, params } = buildLatestBarsPageQuery('cn_daily_bars', {
      tradeDate: '2024-01-02',
      afterCode: '000002',
      limit: 50,
    })
    assert.match(sql, /trade_date = \?/)
    assert.match(sql, /code > \?/)
    assert.match(sql, /ORDER BY code/)
    assert.match(sql, /LIMIT \?/)
    assert.deepEqual(params, ['2024-01-02', '000002', 50])
  })

  it('stitchLatestBarsPages concatenates pages without drop/dup', async () => {
    const all = [
      { code: 'a', close: 1, change_pct: 0 },
      { code: 'b', close: 2, change_pct: 0 },
      { code: 'c', close: 3, change_pct: 0 },
      { code: 'd', close: 4, change_pct: 0 },
      { code: 'e', close: 5, change_pct: 0 },
    ]
    let calls = 0
    const stitched = await stitchLatestBarsPages(async ({ afterCode, limit }) => {
      calls++
      const start = afterCode
        ? all.findIndex(r => r.code > afterCode)
        : 0
      if (start < 0) return []
      return all.slice(start, start + limit)
    }, { limit: 2 })
    assert.equal(calls, 3)
    assert.deepEqual(stitched.map(r => r.code), ['a', 'b', 'c', 'd', 'e'])
  })
})

describe('KlineDuckStore latestBarSnapshotPage', () => {
  it('paginated stitch equals full snapshot; cursor no drop/dup', async () => {
    const store = new KlineDuckStore(duckPath)
    const syncedAt = '2024-01-02T00:00:00'
    const codes = ['000001', '000002', '600000', '600519', '688001']
    const rows = codes.flatMap((code, i) => [
      {
        code,
        tradeDate: '2024-01-01',
        open: 10,
        high: 11,
        low: 9,
        close: 10 + i,
        volume: 1000,
        amount: 10000,
        changePct: 0.1 * i,
      },
      {
        code,
        tradeDate: '2024-01-02',
        open: 11,
        high: 12,
        low: 10,
        close: 20 + i,
        volume: 2000,
        amount: 20000,
        changePct: 1 + i,
      },
    ])
    await store.upsertBatch(rows, syncedAt)

    const fullLatest = sortKey(await store.latestBarSnapshot())
    const fullDated = sortKey(await store.latestBarSnapshot('2024-01-02'))

    const stitchedLatest = sortKey(await stitchLatestBarsPages(
      opts => store.latestBarSnapshotPage(opts),
      { limit: 2 },
    ))
    const stitchedDated = sortKey(await stitchLatestBarsPages(
      opts => store.latestBarSnapshotPage(opts),
      { tradeDate: '2024-01-02', limit: 2 },
    ))

    assert.equal(stitchedLatest.length, fullLatest.length)
    assert.equal(stitchedDated.length, fullDated.length)
    assert.deepEqual(stitchedLatest.map(rowKey), fullLatest.map(rowKey))
    assert.deepEqual(stitchedDated.map(rowKey), fullDated.map(rowKey))

    // 游标中间页：after 000002 应得 600000, 600519（limit 2）
    const mid = await store.latestBarSnapshotPage({
      tradeDate: '2024-01-02',
      afterCode: '000002',
      limit: 2,
    })
    assert.deepEqual(mid.map(r => r.code), ['600000', '600519'])

    await store.close()
  })
})
