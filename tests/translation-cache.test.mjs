import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, existsSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const {
  createTranslationCache,
} = require('../apps/desktop/electron/translation-cache.cjs')

describe('desktop translation-cache (memory Map + debounce persist)', () => {
  /** @type {string} */
  let dir
  /** @type {string} */
  let filePath
  /** @type {ReturnType<typeof createTranslationCache>} */
  let cache

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'opptrix-tr-cache-'))
    filePath = join(dir, 'news-translation-cache.json')
  })

  afterEach(() => {
    cache?.dispose?.()
    rmSync(dir, { recursive: true, force: true })
  })

  it('set/get returns the same translation payload (plus cached_at)', () => {
    cache = createTranslationCache({
      filePath,
      persistDebounceMs: 60_000,
      disableExitFlush: true,
    })
    const value = {
      title: '你好',
      body: '正文译文',
      segments: [{ id: '1', text: '段' }],
    }
    cache.set('art1::model.gguf::zh', value)
    const hit = cache.get('art1::model.gguf::zh')
    assert.ok(hit)
    assert.equal(hit.title, '你好')
    assert.equal(hit.body, '正文译文')
    assert.deepEqual(hit.segments, [{ id: '1', text: '段' }])
    assert.equal(typeof hit.cached_at, 'string')
    assert.ok(String(hit.cached_at).length > 0)
  })

  it('does not sync-write on every set; flush persists last state', async () => {
    cache = createTranslationCache({
      filePath,
      persistDebounceMs: 200,
      disableExitFlush: true,
    })
    cache.set('a', { title: '1', body: '1' })
    cache.set('b', { title: '2', body: '2' })
    cache.set('c', { title: '3', body: '3' })
    assert.equal(cache.persistWriteCount, 0)
    assert.equal(existsSync(filePath), false)

    cache.flush()
    assert.equal(cache.persistWriteCount, 1)
    const disk = JSON.parse(readFileSync(filePath, 'utf8'))
    assert.equal(Object.keys(disk).length, 3)
    assert.equal(disk.a.title, '1')
    assert.equal(disk.c.title, '3')

    cache.set('d', { title: '4', body: '4' })
    const writesBefore = cache.persistWriteCount
    await delay(280)
    assert.ok(cache.persistWriteCount > writesBefore)
    const disk2 = JSON.parse(readFileSync(filePath, 'utf8'))
    assert.ok(disk2.d)
    assert.equal(disk2.d.title, '4')
  })

  it('clear empties memory and writes disk immediately', () => {
    cache = createTranslationCache({
      filePath,
      persistDebounceMs: 60_000,
      disableExitFlush: true,
    })
    cache.set('k', { title: 't', body: 'b' })
    assert.equal(cache.persistWriteCount, 0)
    cache.clear()
    assert.equal(cache.get('k'), null)
    assert.equal(cache.size, 0)
    assert.ok(cache.persistWriteCount >= 1)
    const disk = JSON.parse(readFileSync(filePath, 'utf8'))
    assert.deepEqual(disk, {})
  })

  it('LRU eviction: evicted keys are not readable (memory or after flush)', () => {
    // Policy: once over maxEntries, oldest (least recently used) is dropped from
    // the Map and will not appear on the next disk persist. Callers must re-translate.
    cache = createTranslationCache({
      filePath,
      maxEntries: 2,
      persistDebounceMs: 60_000,
      disableExitFlush: true,
    })
    cache.set('a', { title: 'A', body: 'A' })
    cache.set('b', { title: 'B', body: 'B' })
    // Touch a → b becomes LRU when c is inserted
    assert.equal(cache.get('a')?.title, 'A')
    cache.set('c', { title: 'C', body: 'C' })

    assert.equal(cache.get('b'), null)
    assert.equal(cache.get('a')?.title, 'A')
    assert.equal(cache.get('c')?.title, 'C')
    assert.equal(cache.size, 2)

    cache.flush()
    const disk = JSON.parse(readFileSync(filePath, 'utf8'))
    assert.equal(Object.keys(disk).sort().join(','), 'a,c')
    assert.equal(disk.b, undefined)
  })

  it('loads existing disk file on create (restart semantics)', () => {
    writeFileSync(
      filePath,
      JSON.stringify({
        legacy: {
          title: '旧译文',
          body: '保留',
          cached_at: '2024-01-01T00:00:00.000Z',
        },
      }),
      'utf8',
    )
    cache = createTranslationCache({
      filePath,
      persistDebounceMs: 60_000,
      disableExitFlush: true,
    })
    const hit = cache.get('legacy')
    assert.ok(hit)
    assert.equal(hit.title, '旧译文')
    assert.equal(hit.body, '保留')
  })
})
