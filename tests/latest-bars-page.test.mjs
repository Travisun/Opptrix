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
const { buildLatestBarsPageQuery, clampLatestBarsPageLimit } = await import(
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

    async function stitch(tradeDate) {
      const out = []
      let afterCode = null
      const seen = new Set()
      for (;;) {
        const page = await store.latestBarSnapshotPage({
          tradeDate,
          afterCode,
          limit: 2,
        })
        if (!page.length) break
        for (const r of page) {
          assert.ok(!seen.has(r.code), `duplicate code ${r.code}`)
          seen.add(r.code)
          out.push(r)
        }
        afterCode = page[page.length - 1].code
        if (page.length < 2) break
      }
      return sortKey(out)
    }

    const stitchedLatest = await stitch(null)
    const stitchedDated = await stitch('2024-01-02')

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
