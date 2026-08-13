import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const ENV_KEYS = [
  'OPPTRIX_DUCK_READ_CONCURRENCY',
  'OPPTRIX_SQLITE_MEM_PROFILE',
  'OPPTRIX_DUCK_WARM_ON_BOOT',
]

/** @type {Record<string, string | undefined>} */
const saved = {}

beforeEach(() => {
  for (const key of ENV_KEYS) {
    saved[key] = process.env[key]
    delete process.env[key]
  }
})

afterEach(async () => {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key]
    else process.env[key] = saved[key]
  }
  const { resetDuckCliPools } = await import('../packages/market-data/dist/duck/duck-cli-pool.js')
  await resetDuckCliPools()
  const { resetDuckNeoReaders } = await import('../packages/market-data/dist/duck/duck-neo-reader.js')
  await resetDuckNeoReaders()
})

describe('DuckCliPool read concurrency + boot warm', () => {
  it('OPPTRIX_DUCK_READ_CONCURRENCY forces read concurrency; write stays 1', async () => {
    process.env.OPPTRIX_DUCK_READ_CONCURRENCY = '2'
    process.env.OPPTRIX_SQLITE_MEM_PROFILE = 'low'
    const {
      resolveDuckReadConcurrency,
      DuckCliPool,
    } = await import('../packages/market-data/dist/duck/duck-cli-pool.js')
    assert.equal(resolveDuckReadConcurrency(), 2)
    const pool = new DuckCliPool('test-env-force')
    assert.equal(pool.readConcurrency, 2)
    assert.equal(pool.writeConcurrency, 1)
    await pool.close()
  })

  it('OPPTRIX_SQLITE_MEM_PROFILE=low → read concurrency 1', async () => {
    process.env.OPPTRIX_SQLITE_MEM_PROFILE = 'low'
    const {
      resolveDuckReadConcurrency,
      isDuckLowMemProfile,
      DuckCliPool,
    } = await import('../packages/market-data/dist/duck/duck-cli-pool.js')
    assert.equal(isDuckLowMemProfile(), true)
    assert.equal(resolveDuckReadConcurrency(), 1)
    const pool = new DuckCliPool('test-low')
    assert.equal(pool.readConcurrency, 1)
    assert.equal(pool.writeConcurrency, 1)
    await pool.close()
  })

  it('OPPTRIX_SQLITE_MEM_PROFILE=high → default read concurrency 3', async () => {
    process.env.OPPTRIX_SQLITE_MEM_PROFILE = 'high'
    const {
      resolveDuckReadConcurrency,
      isDuckLowMemProfile,
      DuckCliPool,
    } = await import('../packages/market-data/dist/duck/duck-cli-pool.js')
    assert.equal(isDuckLowMemProfile(), false)
    assert.equal(resolveDuckReadConcurrency(), 3)
    const pool = new DuckCliPool('test-high')
    assert.equal(pool.readConcurrency, 3)
    assert.equal(pool.writeConcurrency, 1)
    await pool.close()
  })

  it('shouldWarmDuckReadCachesOnBoot skips on low or WARM_ON_BOOT=0', async () => {
    const { shouldWarmDuckReadCachesOnBoot } = await import(
      '../packages/market-data/dist/duck/duck-cli-pool.js'
    )

    process.env.OPPTRIX_SQLITE_MEM_PROFILE = 'low'
    assert.equal(shouldWarmDuckReadCachesOnBoot(), false)

    process.env.OPPTRIX_SQLITE_MEM_PROFILE = 'high'
    process.env.OPPTRIX_DUCK_WARM_ON_BOOT = '0'
    assert.equal(shouldWarmDuckReadCachesOnBoot(), false)

    delete process.env.OPPTRIX_DUCK_WARM_ON_BOOT
    process.env.OPPTRIX_SQLITE_MEM_PROFILE = 'medium'
    assert.equal(shouldWarmDuckReadCachesOnBoot(), true)

    process.env.OPPTRIX_DUCK_WARM_ON_BOOT = '1'
    process.env.OPPTRIX_SQLITE_MEM_PROFILE = 'low'
    assert.equal(shouldWarmDuckReadCachesOnBoot(), true)
  })

  it('DuckNeoReader bootstrap locks same resolveDuckReadConcurrency (low → 1)', async () => {
    process.env.OPPTRIX_SQLITE_MEM_PROFILE = 'low'
    const { DuckDBInstance } = await import('@duckdb/node-api')
    const {
      resolveDuckReadConcurrency,
      DuckCliPool,
    } = await import('../packages/market-data/dist/duck/duck-cli-pool.js')
    const {
      getDuckNeoReader,
      peekDuckNeoReaderConcurrency,
    } = await import('../packages/market-data/dist/duck/duck-neo-reader.js')

    assert.equal(resolveDuckReadConcurrency(), 1)
    const pool = new DuckCliPool('neo-align-low')
    assert.equal(pool.readConcurrency, 1)

    const tmp = path.join(os.tmpdir(), `opptrix-neo-conc-${process.pid}-${Date.now()}.duckdb`)
    const created = await DuckDBInstance.create(tmp)
    created.closeSync()
    try {
      await getDuckNeoReader(tmp).queryAll('SELECT 1 AS x')
      assert.equal(peekDuckNeoReaderConcurrency(tmp), 1)
    } finally {
      try { fs.unlinkSync(tmp) } catch { /* ignore */ }
      try { fs.unlinkSync(`${tmp}.wal`) } catch { /* ignore */ }
    }
    await pool.close()
  })
})

describe('marketStats merged SQL + field keys', () => {
  it('NEO_MARKET_STATS_KEYS covers NeoMarketDuckStats / EMPTY shape', async () => {
    const {
      NEO_MARKET_STATS_KEYS,
      buildMarketStatsSql,
    } = await import('../packages/market-data/dist/duck/duck-neo-reader.js')
    assert.equal(NEO_MARKET_STATS_KEYS.length, 22)
    const sql = buildMarketStatsSql('cn_daily_bars')
    for (const key of NEO_MARKET_STATS_KEYS) {
      assert.match(sql, new RegExp(`\\bAS\\s+${key}\\b`), `missing alias AS ${key}`)
    }
    assert.match(sql, /SELECT[\s\S]*\(SELECT COUNT\(\*\)::BIGINT FROM stocks\) AS stocks/)
    assert.doesNotMatch(sql, /await q\(/)
  })
})
