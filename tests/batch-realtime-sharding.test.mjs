/**
 * 大批量 batchRealtime：分片工具 + Engine 片失败隔离 + Tickflow POST 分片次数。
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

describe('batch-chunk utils', () => {
  it('chunkArray splits by size', async () => {
    const { chunkArray, BATCH_REALTIME_CHUNK } = await import(
      '../packages/a-stock-layer/dist/utils/batch-chunk.js'
    )
    assert.equal(BATCH_REALTIME_CHUNK, 100)
    const parts = chunkArray(Array.from({ length: 250 }, (_, i) => i), 100)
    assert.equal(parts.length, 3)
    assert.equal(parts[0].length, 100)
    assert.equal(parts[2].length, 50)
  })

  it('mapPool respects concurrency and order', async () => {
    const { mapPool } = await import('../packages/a-stock-layer/dist/utils/batch-chunk.js')
    let live = 0
    let peak = 0
    const out = await mapPool([1, 2, 3, 4, 5], 2, async (n) => {
      live += 1
      peak = Math.max(peak, live)
      await new Promise(r => setTimeout(r, 5))
      live -= 1
      return n * 10
    })
    assert.deepEqual(out, [10, 20, 30, 40, 50])
    assert.ok(peak <= 2, `peak concurrency ${peak} should be ≤2`)
  })
})

describe('Engine batchRealtime sharding', () => {
  it('250 codes → ≥3 queryPlans.execute; one chunk fail still returns success subset', async () => {
    const { MarketDataEngine } = await import('../packages/a-stock-layer/dist/engine.js')
    const engine = new MarketDataEngine(false)
    const codes = Array.from({ length: 250 }, (_, i) => String(600000 + i).padStart(6, '0'))
    let executeCalls = 0
    engine.queryPlans.execute = async (_plan, opts) => {
      executeCalls += 1
      const part = /** @type {string[]} */ (opts.args?.[0] ?? [])
      // 第 2 片失败
      if (executeCalls === 2) {
        return { success: false, error: 'simulated chunk failure' }
      }
      return {
        success: true,
        source: 'mock',
        data: part.map(code => ({
          code,
          name: code,
          price: 10,
          changePct: 0,
          pe: null,
          pb: null,
          turnoverRate: null,
        })),
      }
    }
    const result = await engine.batchRealtime(codes)
    assert.ok(executeCalls >= 3, `expected ≥3 chunk executes, got ${executeCalls}`)
    assert.equal(result.success, true)
    assert.ok(result.data && result.data.length >= 150, `expected ≥150 rows, got ${result.data?.length}`)
    // 第 2 片（codes 100–199）应缺失
    const returned = new Set((result.data ?? []).map(r => r.code))
    assert.equal(returned.has(codes[100]), false)
    assert.equal(returned.has(codes[0]), true)
    assert.equal(returned.has(codes[200]), true)
  })

  it('all chunks fail → success false', async () => {
    const { MarketDataEngine } = await import('../packages/a-stock-layer/dist/engine.js')
    const engine = new MarketDataEngine(false)
    const codes = Array.from({ length: 150 }, (_, i) => String(600000 + i).padStart(6, '0'))
    engine.queryPlans.execute = async () => ({ success: false, error: 'all fail' })
    const result = await engine.batchRealtime(codes)
    assert.equal(result.success, false)
  })

  it('batchRealtimeByMarket shards US symbols >100', async () => {
    const { MarketDataEngine } = await import('../packages/a-stock-layer/dist/engine.js')
    const engine = new MarketDataEngine(false)
    const symbols = Array.from({ length: 250 }, (_, i) => `S${i}`)
    let scopedCalls = 0
    engine.qScoped = async (...args) => {
      scopedCalls += 1
      const part = /** @type {string[]} */ (args[args.length - 1] ?? [])
      if (scopedCalls === 2) return { success: false, error: 'us chunk fail' }
      return {
        success: true,
        source: 'mock',
        data: part.map(code => ({ code, name: code, price: 1, changePct: 0, pe: null, pb: null, turnoverRate: null })),
      }
    }
    const result = await engine.batchRealtimeByMarket('US', symbols)
    assert.ok(scopedCalls >= 3)
    assert.equal(result.success, true)
    assert.ok(result.data && result.data.length >= 150)
  })
})

describe('Tickflow batchRealtime POST sharding (source + behavior)', () => {
  it('handler source wires postQuotes with chunk / mapPool', () => {
    const src = readFileSync(
      join(root, 'packages/a-stock-layer/src/providers/tickflow/markets/handler.ts'),
      'utf8',
    )
    assert.match(src, /QUOTES_POST_CHUNK|BATCH_REALTIME_CHUNK/)
    assert.match(src, /postQuotes/)
    assert.match(src, /mapPool/)
    assert.match(src, /chunk\(/)
  })

  it('250 symbols → ≥3 postQuotes; one chunk throw still merges others', async () => {
    const prevKey = process.env.TICKFLOW_API_KEY
    process.env.TICKFLOW_API_KEY = 'test-shard-key'
    try {
      // 清掉可能缓存的 free-tier 判定依赖（loadTickflowConfig 读 store / env）
      const { TickflowMarketHandler } = await import(
        '../packages/a-stock-layer/dist/providers/tickflow/markets/handler.js'
      )
      const handler = new TickflowMarketHandler()
      let postCalls = 0
      const fakeClient = {
        getQuotes: async () => ({ data: [] }),
        postQuotes: async (body) => {
          postCalls += 1
          const symbols = body.symbols ?? []
          if (postCalls === 2) throw new Error('simulated postQuotes fail')
          return {
            data: symbols.map(s => ({
              symbol: s,
              last_price: 10,
              prev_close: 10,
              ext: { name: s, change_pct: 0 },
            })),
          }
        },
      }
      handler.client = () => fakeClient
      const codes = Array.from({ length: 250 }, (_, i) => String(600000 + i).padStart(6, '0'))
      const rows = await handler.batchRealtime(codes)
      assert.ok(postCalls >= 3, `expected ≥3 postQuotes, got ${postCalls}`)
      assert.ok(rows && rows.length >= 150, `expected ≥150 rows, got ${rows?.length}`)
    } finally {
      if (prevKey == null) delete process.env.TICKFLOW_API_KEY
      else process.env.TICKFLOW_API_KEY = prevKey
    }
  })
})

describe('Tonghuashun / Zzshare sharding (source)', () => {
  it('tonghuashun batchRealtime uses snapshot chunks and bounded ETF', () => {
    const src = readFileSync(
      join(root, 'packages/a-stock-layer/src/providers/tonghuashun/markets/cn/handler.ts'),
      'utf8',
    )
    assert.match(src, /SNAPSHOT_CHUNK|BATCH_REALTIME_CHUNK_CONSERVATIVE/)
    assert.match(src, /mapPool/)
    assert.match(src, /BATCH_REALTIME_ITEM_CONCURRENCY/)
  })

  it('zzshare rt_k shards long comma lists', () => {
    const src = readFileSync(
      join(root, 'packages/a-stock-layer/src/providers/zzshare/markets/cn/handler.ts'),
      'utf8',
    )
    assert.match(src, /RT_K_CHUNK|BATCH_REALTIME_CHUNK_CONSERVATIVE/)
    assert.match(src, /rt_k/)
    assert.match(src, /chunkArray|mapPool/)
  })
})
