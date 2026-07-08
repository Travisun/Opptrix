import assert from 'node:assert/strict'
import test from 'node:test'
import {
  INITIAL_SYNC_JOBS,
  BOOTSTRAP_SYNC_JOBS,
  DAILY_SYNC_JOBS,
} from '../packages/market-data/dist/sync/config.js'
import { LOCAL_OFFLINE_SCREENING_ENABLED } from '../packages/market-data/dist/sync/instrument-gateway.js'

test('bootstrap is initial-only: no kline or local factor jobs', () => {
  assert.deepEqual(INITIAL_SYNC_JOBS, [
    'initial_cn_universe',
    'initial_hk_universe',
    'initial_us_universe',
    'initial_cn_etf',
    'initial_taxonomy',
  ])
  assert.deepEqual(BOOTSTRAP_SYNC_JOBS, [...INITIAL_SYNC_JOBS])
  assert.ok(!BOOTSTRAP_SYNC_JOBS.includes('kline_bootstrap'))
  assert.ok(!BOOTSTRAP_SYNC_JOBS.includes('screen_factors'))
  assert.ok(DAILY_SYNC_JOBS.includes('initial_cn_etf'))
  assert.ok(!DAILY_SYNC_JOBS.includes('kline_daily'))
})

test('local offline screening disabled by default', () => {
  assert.equal(LOCAL_OFFLINE_SCREENING_ENABLED, false)
})
