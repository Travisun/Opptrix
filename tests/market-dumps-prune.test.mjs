/**
 * market dumps prune：半成品 + TTL/容量硬顶。
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile, utimes, readdir, access } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const {
  pruneMarketDumps,
  resolveDumpsMaxAgeMs,
  resolveDumpsMaxBytes,
  resolveDumpsIncompleteMaxAgeMs,
  DEFAULT_DUMPS_MAX_AGE_MS,
  DEFAULT_DUMPS_MAX_BYTES,
  DEFAULT_DUMPS_INCOMPLETE_MAX_AGE_MS,
} = await import('../packages/market-data/dist/sync/dumps-prune.js')

async function exists(p) {
  try {
    await access(p)
    return true
  } catch {
    return false
  }
}

describe('market dumps prune', () => {
  it('env 0 disables the corresponding dimension; defaults otherwise', () => {
    assert.equal(resolveDumpsMaxAgeMs(undefined, {}), DEFAULT_DUMPS_MAX_AGE_MS)
    assert.equal(resolveDumpsMaxBytes(undefined, {}), DEFAULT_DUMPS_MAX_BYTES)
    assert.equal(
      resolveDumpsIncompleteMaxAgeMs(undefined, {}),
      DEFAULT_DUMPS_INCOMPLETE_MAX_AGE_MS,
    )
    assert.equal(resolveDumpsMaxAgeMs(undefined, { OPPTRIX_DUMPS_MAX_AGE_MS: '0' }), 0)
    assert.equal(resolveDumpsMaxBytes(undefined, { OPPTRIX_DUMPS_MAX_BYTES: '0' }), 0)
    assert.equal(
      resolveDumpsIncompleteMaxAgeMs(undefined, { OPPTRIX_DUMPS_INCOMPLETE_MAX_AGE_MS: '0' }),
      0,
    )
    assert.equal(
      resolveDumpsMaxAgeMs(undefined, { OPPTRIX_DUMPS_MAX_AGE_MS: '3600000' }),
      3_600_000,
    )
    assert.equal(resolveDumpsMaxAgeMs(1234, { OPPTRIX_DUMPS_MAX_AGE_MS: '0' }), 1234)
  })

  it('removes stale incomplete .tmp/.download then TTL/capacity on complete files', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'opptrix-dumps-'))
    try {
      const now = Date.now()
      const staleTmp = join(dir, 'cn-daily-k-full.parquet.tmp')
      const freshDownload = join(dir, 'cn-daily-k-incr.parquet.download')
      const oldComplete = join(dir, 'old-extra.parquet')
      const keepComplete = join(dir, 'cn-daily-k-full.parquet')

      await writeFile(staleTmp, Buffer.alloc(50, 1))
      await writeFile(freshDownload, Buffer.alloc(50, 2))
      await writeFile(oldComplete, Buffer.alloc(100, 3))
      await writeFile(keepComplete, Buffer.alloc(100, 4))

      const twoHoursAgo = new Date(now - 2 * 60 * 60 * 1000)
      const recent = new Date(now - 60_000)
      const twentyDaysAgo = new Date(now - 20 * 24 * 60 * 60 * 1000)
      await utimes(staleTmp, twoHoursAgo, twoHoursAgo)
      await utimes(freshDownload, recent, recent)
      await utimes(oldComplete, twentyDaysAgo, twentyDaysAgo)
      await utimes(keepComplete, recent, recent)

      const result = await Promise.resolve(
        pruneMarketDumps({
          dumpsDir: dir,
          incompleteMaxAgeMs: DEFAULT_DUMPS_INCOMPLETE_MAX_AGE_MS,
          maxAgeMs: DEFAULT_DUMPS_MAX_AGE_MS,
          maxBytes: 10_000,
          nowMs: now,
        }),
      )

      assert.equal(await exists(staleTmp), false)
      assert.equal(await exists(freshDownload), true)
      assert.equal(await exists(oldComplete), false)
      assert.equal(await exists(keepComplete), true)
      assert.ok(result.removedIncomplete >= 1)
      assert.ok(result.removedFiles >= 2)

      const left = await readdir(dir)
      assert.ok(left.includes('cn-daily-k-full.parquet'))
      assert.ok(left.includes('cn-daily-k-incr.parquet.download'))
      assert.ok(!left.includes('old-extra.parquet'))
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('maxAgeMs 0 and maxBytes 0 leave complete files; still can prune incomplete by age', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'opptrix-dumps-off-'))
    try {
      const now = Date.now()
      const complete = join(dir, 'keep.parquet')
      const staleTmp = join(dir, 'x.parquet.tmp')
      await writeFile(complete, Buffer.alloc(80, 9))
      await writeFile(staleTmp, Buffer.alloc(20, 8))
      const old = new Date(now - 30 * 24 * 60 * 60 * 1000)
      await utimes(complete, old, old)
      await utimes(staleTmp, old, old)

      const result = pruneMarketDumps({
        dumpsDir: dir,
        maxAgeMs: 0,
        maxBytes: 0,
        incompleteMaxAgeMs: DEFAULT_DUMPS_INCOMPLETE_MAX_AGE_MS,
        nowMs: now,
      })
      assert.equal(await exists(complete), true)
      assert.equal(await exists(staleTmp), false)
      assert.equal(result.removedIncomplete, 1)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('capacity deletes incomplete before complete, oldest first', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'opptrix-dumps-cap-'))
    try {
      const now = Date.now()
      const a = join(dir, 'a.parquet')
      const b = join(dir, 'b.parquet')
      const tmp = join(dir, 'c.parquet.tmp')
      await writeFile(a, Buffer.alloc(100, 1))
      await writeFile(b, Buffer.alloc(100, 2))
      await writeFile(tmp, Buffer.alloc(100, 3))
      await utimes(a, new Date(now - 300_000), new Date(now - 300_000))
      await utimes(b, new Date(now - 60_000), new Date(now - 60_000))
      await utimes(tmp, new Date(now - 120_000), new Date(now - 120_000))

      const result = pruneMarketDumps({
        dumpsDir: dir,
        maxAgeMs: 0,
        incompleteMaxAgeMs: 0,
        maxBytes: 150,
        nowMs: now,
      })
      assert.ok(result.removedFiles >= 1)
      assert.equal(await exists(tmp), false)
      assert.ok(result.remainingBytes <= 150)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
