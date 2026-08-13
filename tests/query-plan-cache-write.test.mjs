/**
 * QueryPlan 写缓存与 watchlist 对齐：useCache 可读；writeCache=false 时不 set。
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { Capability } from '../packages/a-stock-layer/dist/core/capabilities.js'
import {
  QueryPlanExecutor,
  QUERY_PLANS,
} from '../packages/a-stock-layer/dist/core/query-plan.js'

function makeKlineRows(code = '600519', n = 3) {
  return Array.from({ length: n }, (_, i) => ({
    code,
    date: `2026-01-${String(i + 1).padStart(2, '0')}`,
    open: 100,
    high: 101,
    low: 99,
    close: 100.5,
    volume: 1000,
  }))
}

function makeMockCache() {
  const store = new Map()
  const sets = []
  const gets = []
  const keyOf = (cacheType, method, params) =>
    `${cacheType}:${method}:${JSON.stringify(params)}`
  return {
    sets,
    gets,
    get(cacheType, method, params) {
      gets.push({ cacheType, method, params })
      return store.get(keyOf(cacheType, method, params)) ?? null
    },
    set(cacheType, data, method, params, source) {
      sets.push({ cacheType, method, params, source, size: Array.isArray(data) ? data.length : 0 })
      store.set(keyOf(cacheType, method, params), data)
    },
    seed(cacheType, method, params, data) {
      store.set(keyOf(cacheType, method, params), data)
    },
  }
}

function makeMockRegistry(rows) {
  const driver = {
    name: 'mock-paid-kline',
    selfThrottled: true,
    async kline() {
      return rows
    },
    async indexKline() {
      return rows
    },
  }
  return {
    getProvidersWithFallback() {
      return [driver]
    },
    getLoadAwareProvider() {
      return driver
    },
    notifyAcquire() {},
    notifyRelease() {},
    rebuildIndicesWithRanking() {},
    getEffectivePriority() {
      return 10
    },
  }
}

const baseCtx = {
  method: 'kline',
  cacheType: 'stock_kline',
  args: ['600519', 'daily', '', '', 800],
  assetClass: 'EQUITY',
}

describe('QueryPlanExecutor writeCache vs useCache', () => {
  it('writeCache:false 不写缓存，但仍从 Provider 返回完整数据', async () => {
    const rows = makeKlineRows()
    const cache = makeMockCache()
    const executor = new QueryPlanExecutor(makeMockRegistry(rows), cache)
    const result = await executor.execute(QUERY_PLANS.cn_equity_stock_kline_daily, {
      ...baseCtx,
      useCache: true,
      writeCache: false,
    })
    assert.equal(result.success, true)
    assert.equal(result.data?.length, rows.length)
    assert.equal(result.cached, false)
    assert.equal(cache.sets.length, 0)
    assert.ok(cache.gets.length >= 1)
  })

  it('writeCache:true（watchlist 路径）成功后写入缓存', async () => {
    const rows = makeKlineRows()
    const cache = makeMockCache()
    const executor = new QueryPlanExecutor(makeMockRegistry(rows), cache)
    const result = await executor.execute(QUERY_PLANS.cn_equity_stock_kline_daily, {
      ...baseCtx,
      useCache: true,
      writeCache: true,
    })
    assert.equal(result.success, true)
    assert.equal(cache.sets.length, 1)
    assert.equal(cache.sets[0].cacheType, 'stock_kline')
    assert.equal(cache.sets[0].size, rows.length)
  })

  it('缺省 writeCache 时与 useCache 一致（向后兼容：读写都开）', async () => {
    const rows = makeKlineRows()
    const cache = makeMockCache()
    const executor = new QueryPlanExecutor(makeMockRegistry(rows), cache)
    await executor.execute(QUERY_PLANS.cn_equity_stock_kline_daily, {
      ...baseCtx,
      useCache: true,
    })
    assert.equal(cache.sets.length, 1)
  })

  it('useCache:true 可读已有缓存且不重复写', async () => {
    const rows = makeKlineRows('600519', 5)
    const cache = makeMockCache()
    const plan = QUERY_PLANS.cn_equity_stock_kline_daily
    const params = {
      method: 'kline',
      plan: plan.id,
      market: plan.market,
      assetClass: 'EQUITY',
      args: JSON.stringify(baseCtx.args),
    }
    cache.seed('stock_kline', 'kline', params, rows)
    let providerCalls = 0
    const registry = makeMockRegistry(rows)
    const driver = registry.getLoadAwareProvider()
    const orig = driver.kline.bind(driver)
    driver.kline = async (...a) => {
      providerCalls += 1
      return orig(...a)
    }
    const executor = new QueryPlanExecutor(registry, cache)
    const result = await executor.execute(plan, {
      ...baseCtx,
      useCache: true,
      writeCache: false,
    })
    assert.equal(result.success, true)
    assert.equal(result.cached, true)
    assert.equal(result.source, 'cache')
    assert.equal(result.data?.length, 5)
    assert.equal(providerCalls, 0)
    assert.equal(cache.sets.length, 0)
  })

  it('指数 K 线 plan 同样尊重 writeCache:false', async () => {
    const rows = makeKlineRows('000001')
    const cache = makeMockCache()
    const executor = new QueryPlanExecutor(makeMockRegistry(rows), cache)
    const result = await executor.execute(QUERY_PLANS.cn_index_index_kline, {
      method: 'indexKline',
      cacheType: 'index_kline',
      useCache: true,
      writeCache: false,
      args: ['000001', 'daily', '', '', 800],
      assetClass: 'INDEX',
    })
    assert.equal(result.success, true)
    assert.equal(cache.sets.length, 0)
    assert.ok(Capability.INDEX_KLINE)
  })
})
