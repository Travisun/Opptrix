/**
 * Duck tmp 崩溃孤儿清理：mtime TTL prune 与 finally unlink 并存。
 */
import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile, utimes, access } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, it } from 'node:test'

describe('pruneOrphanDuckTempJson', () => {
  it('removes stale opptrix-duck / kline temp json; keeps fresh; finally unlink still works', async () => {
    const {
      pruneOrphanDuckTempJson,
      withCompactTempJsonSync,
      listOpptrixDuckTempJson,
      DEFAULT_DUCK_TEMP_MAX_AGE_MS,
    } = await import('../packages/market-data/dist/duck/duck-temp-json.js')

    const dir = await mkdtemp(join(tmpdir(), 'opptrix-duck-orphan-'))
    const now = Date.now()
    const stalePath = join(dir, `opptrix-duck-batch-999-${now}-stale.json`)
    const freshPath = join(dir, `opptrix-duck-query-999-${now}-fresh.json`)
    const klineStale = join(dir, `opptrix-kline-upsert-999-${now}-stale.json`)
    const unrelated = join(dir, `other-temp-${now}.json`)

    await writeFile(stalePath, '{"orphan":true}')
    await writeFile(freshPath, '{"hot":true}')
    await writeFile(klineStale, '{"kline":true}')
    await writeFile(unrelated, '{"keep":true}')

    const twoHoursAgo = new Date(now - 2 * 60 * 60 * 1000)
    const recent = new Date(now - 60_000)
    await utimes(stalePath, twoHoursAgo, twoHoursAgo)
    await utimes(klineStale, twoHoursAgo, twoHoursAgo)
    await utimes(freshPath, recent, recent)

    const result = pruneOrphanDuckTempJson({
      dir,
      maxAgeMs: DEFAULT_DUCK_TEMP_MAX_AGE_MS,
      nowMs: now,
    })

    assert.equal(result.removedFiles, 2)
    assert.equal(result.skippedFresh, 1)
    assert.equal(result.scanned, 3)

    await assert.rejects(() => access(stalePath), /ENOENT/)
    await assert.rejects(() => access(klineStale), /ENOENT/)
    await access(freshPath)
    await access(unrelated)

    const left = listOpptrixDuckTempJson(dir)
    assert.deepEqual(left, [freshPath])

    const seen = { path: /** @type {string | null} */ (null) }
    withCompactTempJsonSync('batch', [{ op: 'noop' }], filePath => {
      seen.path = filePath
      return 1
    })
    assert.ok(seen.path)
    await assert.rejects(() => access(seen.path), /ENOENT/)

    await rm(dir, { recursive: true, force: true })
  })
})
