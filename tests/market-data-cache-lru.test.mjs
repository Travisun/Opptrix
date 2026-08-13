import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'

const { Cache } = await import('../packages/market-data-core/dist/core/cache.js')

describe('market-data Cache LRU + persist throttle', () => {
  /** @type {string} */
  let dir
  /** @type {string} */
  let filePath
  /** @type {InstanceType<typeof Cache>} */
  let cache

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'opptrix-cache-'))
    filePath = join(dir, 'cache.json')
  })

  afterEach(() => {
    cache?.dispose?.()
    rmSync(dir, { recursive: true, force: true })
  })

  it('evicts least-recently-used when over maxEntries', () => {
    cache = new Cache(filePath, {
      maxEntries: 2,
      persistDebounceMs: 60_000,
      disableExitFlush: true,
    })
    cache.setWithTtl('stock_kline', [1], 'm', { id: 'a' }, 3600, 'p1')
    cache.setWithTtl('stock_kline', [2], 'm', { id: 'b' }, 3600, 'p1')
    // Touch a so b becomes LRU when c is inserted
    assert.deepEqual(cache.getWithTtl('stock_kline', 'm', { id: 'a' }, 3600), [1])
    cache.setWithTtl('stock_kline', [3], 'm', { id: 'c' }, 3600, 'p1')

    assert.equal(cache.getWithTtl('stock_kline', 'm', { id: 'b' }, 3600), null)
    assert.deepEqual(cache.getWithTtl('stock_kline', 'm', { id: 'a' }, 3600), [1])
    assert.deepEqual(cache.getWithTtl('stock_kline', 'm', { id: 'c' }, 3600), [3])
    const s = cache.stats()
    assert.equal(s.entries, 2)
    assert.equal(s.stock_kline.count, 2)
    assert.ok(typeof s.approxBytes === 'number')
  })

  it('TTL=0 skips cache; positive TTL returns full data', () => {
    cache = new Cache(filePath, { persistDebounceMs: 60_000, disableExitFlush: true })
    const rows = Array.from({ length: 50 }, (_, i) => ({ i, v: `row-${i}` }))
    cache.setWithTtl('stock_realtime', rows, 'rt', { code: '600519' }, 0, 'tencent')
    assert.equal(cache.getWithTtl('stock_realtime', 'rt', { code: '600519' }, 0), null)
    assert.equal(cache.stats().entries, 0)

    cache.setWithTtl('stock_kline', rows, 'kl', { code: '600519' }, 3600, 'tencent')
    const hit = cache.getWithTtl('stock_kline', 'kl', { code: '600519' }, 3600)
    assert.deepEqual(hit, rows)
    assert.equal(hit.length, 50)
  })

  it('clearBySource removes only matching source and flushes immediately', () => {
    cache = new Cache(filePath, { persistDebounceMs: 60_000, disableExitFlush: true })
    cache.setWithTtl('stock_kline', [1], 'm', { id: 'a' }, 3600, 'alpha')
    cache.setWithTtl('stock_kline', [2], 'm', { id: 'b' }, 3600, 'beta')
    const n = cache.clearBySource('alpha')
    assert.equal(n, 1)
    assert.equal(cache.getWithTtl('stock_kline', 'm', { id: 'a' }, 3600), null)
    assert.deepEqual(cache.getWithTtl('stock_kline', 'm', { id: 'b' }, 3600), [2])
    assert.ok(existsSync(filePath))
    const disk = JSON.parse(readFileSync(filePath, 'utf8'))
    assert.equal(Object.keys(disk).length, 1)
    assert.ok(cache.persistWriteCount >= 1)
  })

  it('debounces disk writes and flush persists the last state', async () => {
    cache = new Cache(filePath, {
      persistDebounceMs: 200,
      disableExitFlush: true,
    })
    cache.setWithTtl('stock_kline', [1], 'm', { id: 'a' }, 3600, 'p')
    cache.setWithTtl('stock_kline', [2], 'm', { id: 'b' }, 3600, 'p')
    cache.setWithTtl('stock_kline', [3], 'm', { id: 'c' }, 3600, 'p')
    // Before debounce fires: no sync write-per-set (at most 0 writes yet)
    assert.equal(cache.persistWriteCount, 0)
    assert.equal(existsSync(filePath), false)

    cache.flush()
    assert.equal(cache.persistWriteCount, 1)
    const disk = JSON.parse(readFileSync(filePath, 'utf8'))
    assert.equal(Object.keys(disk).length, 3)

    // Debounced path also eventually writes without manual flush
    cache.setWithTtl('stock_kline', [4], 'm', { id: 'd' }, 3600, 'p')
    const writesBefore = cache.persistWriteCount
    await delay(280)
    assert.ok(cache.persistWriteCount > writesBefore)
    const disk2 = JSON.parse(readFileSync(filePath, 'utf8'))
    assert.ok(Object.keys(disk2).some(k => k.includes('"id":"d"')))
  })

  it('oversized entry stays readable in memory but is omitted from disk', () => {
    cache = new Cache(filePath, {
      persistDebounceMs: 60_000,
      maxDiskEntryBytes: 200,
      disableExitFlush: true,
    })
    const big = { blob: 'x'.repeat(2000) }
    const small = { ok: true }
    cache.setWithTtl('stock_kline', big, 'm', { id: 'big' }, 3600, 'p')
    cache.setWithTtl('stock_profile', small, 'm', { id: 'small' }, 3600, 'p')
    assert.deepEqual(cache.getWithTtl('stock_kline', 'm', { id: 'big' }, 3600), big)

    cache.flush()
    const disk = JSON.parse(readFileSync(filePath, 'utf8'))
    const keys = Object.keys(disk)
    assert.equal(keys.length, 1)
    assert.ok(keys[0].includes('stock_profile'))
    assert.ok(!keys[0].includes('"id":"big"'))
  })

  it('large array set stays fast (sampled estimateBytes) and still hits', () => {
    cache = new Cache(filePath, {
      persistDebounceMs: 60_000,
      disableExitFlush: true,
    })
    const rows = Array.from({ length: 40_000 }, (_, i) => ({
      i,
      o: 10 + (i % 7),
      h: 11,
      l: 9,
      c: 10.5,
      v: 1000 + i,
    }))
    const t0 = performance.now()
    cache.setWithTtl('stock_kline', rows, 'kl', { code: '600519' }, 3600, 'tencent')
    const elapsed = performance.now() - t0
    assert.ok(elapsed < 250, `setWithTtl took ${elapsed.toFixed(1)}ms`)
    const hit = cache.getWithTtl('stock_kline', 'kl', { code: '600519' }, 3600)
    assert.equal(hit, rows)
    assert.equal(hit.length, 40_000)
    const s = cache.stats()
    assert.ok(s.approxBytes > 100_000)
  })
})

describe('deprecated MemoryCache hard maxEntries LRU', () => {
  it('evicts oldest when over maxEntries', async () => {
    const { MemoryCache } = await import('../packages/market-data-core/dist/core/cache.js')
    const mem = new MemoryCache(2)
    mem.set('a', 1, 60_000)
    mem.set('b', 2, 60_000)
    assert.equal(mem.get('a'), 1) // touch a → b becomes LRU
    mem.set('c', 3, 60_000)
    assert.equal(mem.size, 2)
    assert.equal(mem.get('b'), null)
    assert.equal(mem.get('a'), 1)
    assert.equal(mem.get('c'), 3)
  })
})
