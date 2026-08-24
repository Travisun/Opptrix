/**
 * watchlist 覆盖层缓存 TTL 的回归测试：
 * 实时行情类必须 TTL=0（不缓存），否则兜底 86400 会把
 * US/HK/CRYPTO 实时报价冻结 24h 并持久化到 cache.json 重启不失效。
 */
import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  WATCHLIST_INSTRUMENT_TTL,
  watchlistCacheTtl,
  Cache,
} from '@opptrix/market-data-core'

/** 与 a-stock-layer engine.queryScoped 走 watchlistCacheTtl 的实时类键清单 */
const REALTIME_TYPES = ['stock_realtime', 'index_realtime', 'fund_quote', 'crypto_realtime']
/** 非实时类抽查：TTL 必须 > 0 且等于表内定义 */
const NON_REALTIME_TYPES = ['stock_kline', 'stock_profile', 'financial_summary', 'news', 'etf_holdings']

describe('watchlistCacheTtl', () => {
  it('实时行情类 TTL 为 0（watchlist 覆盖层不缓存）', () => {
    for (const type of REALTIME_TYPES) {
      assert.equal(watchlistCacheTtl(type), 0, `${type} 不应被 watchlist 缓存`)
      assert.equal(WATCHLIST_INSTRUMENT_TTL[type], 0)
    }
  })

  it('非实时类 TTL > 0 且与表内定义一致', () => {
    for (const type of NON_REALTIME_TYPES) {
      const ttl = watchlistCacheTtl(type)
      assert.ok(ttl > 0, `${type} TTL 应为正数，got ${ttl}`)
      assert.equal(ttl, WATCHLIST_INSTRUMENT_TTL[type])
    }
  })

  it('未知 cacheType 回退到默认 86400（仅对表内遗漏键生效）', () => {
    assert.equal(watchlistCacheTtl('some_unknown_dimension'), 86400)
  })
})

describe('Cache ttl=0 短路', () => {
  /** @type {string} */
  let dir
  /** @type {string} */
  let filePath
  /** @type {InstanceType<typeof Cache>} */
  let cache

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'opptrix-watchlist-ttl-'))
    filePath = join(dir, 'cache.json')
    cache = new Cache(filePath, {
      persistDebounceMs: 60_000,
      disableExitFlush: true,
    })
  })

  afterEach(() => {
    cache?.dispose?.()
    rmSync(dir, { recursive: true, force: true })
  })

  it('已存在实时条目（模拟旧 86400 持久化）在 ttl=0 下不会被读取', () => {
    const params = { args: JSON.stringify(['AAPL']) }
    // 旧版本按兜底 86400 写入的同 key 实时条目
    cache.setWithTtl('stock_realtime', [{ symbol: 'AAPL' }], 'realtime', params, 86400, 'p1')
    assert.equal(cache.getWithTtl('stock_realtime', 'realtime', params, 0), null)
  })

  it('ttl=0 写入被跳过，不会产生新缓存条目', () => {
    const params = { args: JSON.stringify(['BTCUSDT']) }
    cache.setWithTtl('crypto_realtime', [{ symbol: 'BTCUSDT' }], 'realtime', params, 0, 'p1')
    assert.equal(cache.getWithTtl('crypto_realtime', 'realtime', params, 86400), null)
  })
})
