/**
 * ensureSearchUniverseReady — 缺名录才 start；running 中不重复 start；只带缺失 job。
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  ensureSearchUniverseReady,
  listMissingSearchUniverseJobs,
} from '../packages/market-data/dist/sync/search-universe-ready.js'

describe('listMissingSearchUniverseJobs', () => {
  it('returns empty when cursors and counts are healthy', () => {
    const missing = listMissingSearchUniverseJobs({
      getCursorLastSuccess: () => '2026-01-01T00:00:00.000Z',
      countEquity: market => (market === 'HK' ? 800 : 2000),
    })
    assert.deepEqual(missing, [])
  })

  it('only lists HK when only HK is below threshold', () => {
    const missing = listMissingSearchUniverseJobs({
      getCursorLastSuccess: job => (job === 'initial_hk_universe' ? null : '2026-01-01T00:00:00.000Z'),
      countEquity: market => {
        if (market === 'CN') return 5000
        if (market === 'US') return 5000
        return 10
      },
    })
    assert.deepEqual(missing, ['initial_hk_universe'])
  })
})

describe('ensureSearchUniverseReady', () => {
  it('ready — does not start', async () => {
    let startCalls = 0
    const result = await ensureSearchUniverseReady({
      getCursorLastSuccess: () => '2026-01-01T00:00:00.000Z',
      countEquity: () => 5000,
      isRunning: () => false,
      getSnapshot: () => ({ overall_percent: 0, message: null, running: false }),
      getSessionJobs: () => [],
      start: async () => {
        startCalls += 1
        return { started: true, running: true }
      },
    })
    assert.equal(result.status, 'ready')
    assert.equal(result.started, false)
    assert.deepEqual(result.jobs, [])
    assert.equal(result.percent, 100)
    assert.equal(startCalls, 0)
  })

  it('missing HK only — starts with initial_hk_universe', async () => {
    let startedJobs = null
    const result = await ensureSearchUniverseReady({
      getCursorLastSuccess: job => (job === 'initial_hk_universe' ? null : '2026-01-01T00:00:00.000Z'),
      countEquity: market => (market === 'HK' ? 0 : 5000),
      isRunning: () => false,
      getSnapshot: () => ({ overall_percent: 12, message: '正在准备标的库…', running: true }),
      getSessionJobs: () => [],
      start: async jobs => {
        startedJobs = [...jobs]
        return { started: true, running: true }
      },
    })
    assert.equal(result.status, 'preparing')
    assert.equal(result.started, true)
    assert.deepEqual(startedJobs, ['initial_hk_universe'])
    assert.deepEqual(result.jobs, ['initial_hk_universe'])
    assert.ok(result.percent >= 0)
  })

  it('already running — does not start again', async () => {
    let startCalls = 0
    const result = await ensureSearchUniverseReady({
      getCursorLastSuccess: () => null,
      countEquity: () => 0,
      isRunning: () => true,
      getSnapshot: () => ({ overall_percent: 40, message: '同步中', running: true }),
      getSessionJobs: () => ['initial_cn_universe', 'initial_hk_universe', 'initial_us_universe'],
      start: async () => {
        startCalls += 1
        return { started: true, running: true }
      },
    })
    assert.equal(result.status, 'preparing')
    assert.equal(result.started, false)
    assert.equal(startCalls, 0)
    assert.equal(result.percent, 40)
  })

  it('start refused — failed with product copy', async () => {
    const result = await ensureSearchUniverseReady({
      getCursorLastSuccess: () => null,
      countEquity: () => 0,
      isRunning: () => false,
      getSnapshot: () => ({ overall_percent: 0, message: null, running: false }),
      getSessionJobs: () => [],
      start: async () => ({ started: false, running: false }),
    })
    assert.equal(result.status, 'failed')
    assert.equal(result.started, false)
    assert.match(result.message, /标的库/)
  })
})
