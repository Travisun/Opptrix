import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

const {
  LruMap,
  createNameCache,
  DEFAULT_NAME_CACHE_MAX_ENTRIES,
} = await import('../packages/a-stock-layer/dist/utils/lru-map.js')

describe('LruMap / Provider nameCache hard cap', () => {
  it('evicts least-recently-used when over maxEntries', () => {
    const cache = new LruMap(2)
    cache.set('a', 'A')
    cache.set('b', 'B')
    assert.equal(cache.get('a'), 'A') // touch a → MRU
    cache.set('c', 'C')
    assert.equal(cache.has('b'), false)
    assert.equal(cache.get('a'), 'A')
    assert.equal(cache.get('c'), 'C')
    assert.equal(cache.size, 2)
  })

  it('updates existing key without growing past max', () => {
    const cache = new LruMap(2)
    cache.set('a', '1')
    cache.set('b', '2')
    cache.set('a', '1b')
    assert.equal(cache.size, 2)
    assert.equal(cache.get('a'), '1b')
    cache.set('c', '3')
    // b should be LRU after a was re-set then get
    assert.equal(cache.has('b'), false)
    assert.equal(cache.get('c'), '3')
  })

  it('createNameCache defaults to hard cap and stays bounded under bulk fill', () => {
    assert.equal(DEFAULT_NAME_CACHE_MAX_ENTRIES, 8000)
    const cache = createNameCache(100)
    for (let i = 0; i < 250; i += 1) {
      cache.set(`c${i}`, `n${i}`)
    }
    assert.equal(cache.size, 100)
    assert.equal(cache.has('c0'), false)
    assert.equal(cache.get('c249'), 'n249')
  })

  it('is assignable as Map for normalize helpers', () => {
    const names = createNameCache(3)
    names.set('600519', '贵州茅台')
    /** @type {Map<string, string>} */
    const asMap = names
    assert.equal(asMap.get('600519'), '贵州茅台')
  })
})
