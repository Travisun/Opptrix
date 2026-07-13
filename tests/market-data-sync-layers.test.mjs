import assert from 'node:assert/strict'
import test from 'node:test'
import {
  CN_BOOTSTRAP_SYNC_JOBS,
  CN_MAINTENANCE_SYNC_JOBS,
  CN_AUTO_SYNC_JOB_UNIVERSE,
  CN_CORE_SYNC_JOBS,
  CN_MANUAL_SYNC_JOBS,
  INITIAL_SYNC_JOBS,
  BOOTSTRAP_SYNC_JOBS,
  DAILY_SYNC_JOBS,
  DEFAULT_AUTO_SYNC_JOBS,
  DEFAULT_DAILY_SYNC_JOBS,
  LEGACY_INITIAL_SYNC_JOBS,
  SYNC_JOB_CONFIG,
} from '../packages/market-data/dist/sync/config.js'
import {
  cnUniverseMaintenanceDue,
  cnTaxonomyMaintenanceDue,
  cnKlineDailyMaintenanceDue,
  cnMaintenanceJobsDue,
  isCnMondayAfterMarketClose,
} from '../packages/market-data/dist/sync/schedule.js'
import { LOCAL_OFFLINE_SCREENING_ENABLED } from '../packages/market-data/dist/sync/instrument-gateway.js'

const daysAgo = n => new Date(Date.now() - n * 86400000).toISOString()

test('CN auto sync: bootstrap includes kline; maintenance includes daily kline', () => {
  assert.deepEqual(CN_BOOTSTRAP_SYNC_JOBS, [
    'initial_cn_universe',
    'initial_taxonomy',
    'kline_bootstrap',
  ])
  assert.deepEqual(CN_MAINTENANCE_SYNC_JOBS, [
    'initial_cn_universe',
    'kline_daily',
    'initial_taxonomy',
  ])
  assert.deepEqual(CN_AUTO_SYNC_JOB_UNIVERSE, [
    ...CN_BOOTSTRAP_SYNC_JOBS,
    'kline_daily',
  ])
  assert.deepEqual(CN_CORE_SYNC_JOBS, ['initial_cn_universe', 'initial_taxonomy'])
  assert.deepEqual(INITIAL_SYNC_JOBS, [...CN_BOOTSTRAP_SYNC_JOBS])
  assert.deepEqual(BOOTSTRAP_SYNC_JOBS, [...CN_BOOTSTRAP_SYNC_JOBS])
  assert.deepEqual(DEFAULT_AUTO_SYNC_JOBS, [...CN_BOOTSTRAP_SYNC_JOBS])
  assert.deepEqual(DEFAULT_DAILY_SYNC_JOBS, [...CN_MAINTENANCE_SYNC_JOBS])
  assert.deepEqual(DAILY_SYNC_JOBS, [...CN_MAINTENANCE_SYNC_JOBS])
  assert.deepEqual(CN_MANUAL_SYNC_JOBS, [
    'initial_cn_universe',
    'initial_taxonomy',
    'kline_bootstrap',
    'kline_daily',
  ])
  assert.ok(BOOTSTRAP_SYNC_JOBS.includes('kline_bootstrap'))
  assert.ok(!BOOTSTRAP_SYNC_JOBS.includes('initial_hk_universe'))
  assert.deepEqual(LEGACY_INITIAL_SYNC_JOBS, [
    'initial_hk_universe',
    'initial_us_universe',
    'initial_cn_etf',
  ])
})

test('CN sync TTL: universe weekly, taxonomy weekly staggered, kline weekly', () => {
  assert.equal(SYNC_JOB_CONFIG.initial_cn_universe.ttlDays, 7)
  assert.equal(SYNC_JOB_CONFIG.initial_taxonomy.ttlDays, 7)
  assert.equal(SYNC_JOB_CONFIG.kline_bootstrap.ttlDays, 30)
  assert.equal(SYNC_JOB_CONFIG.kline_daily.ttlDays, 7)
})

test('maintenance schedule: universe and taxonomy alternate weekly', () => {
  const base = {
    initial_cn_universe: daysAgo(8),
    initial_taxonomy: daysAgo(1),
    kline_daily: daysAgo(8),
  }
  assert.equal(cnUniverseMaintenanceDue(base), false)
  assert.equal(cnTaxonomyMaintenanceDue(base), false)

  const taxDue = {
    initial_cn_universe: daysAgo(8),
    initial_taxonomy: daysAgo(8),
    kline_daily: daysAgo(8),
  }
  const jobs = cnMaintenanceJobsDue(taxDue)
  assert.equal(jobs.length, 1)
  assert.ok(jobs[0] === 'initial_cn_universe' || jobs[0] === 'initial_taxonomy')

  const firstTaxonomy = {
    initial_cn_universe: daysAgo(1),
    initial_taxonomy: null,
    kline_daily: null,
  }
  assert.equal(cnTaxonomyMaintenanceDue(firstTaxonomy), true)
})

test('kline daily only runs Monday after CN market close', () => {
  const mondayAfterClose = new Date('2026-07-13T08:00:00.000Z') // 16:00 BJ
  assert.equal(isCnMondayAfterMarketClose(mondayAfterClose), true)

  const mondayBeforeClose = new Date('2026-07-13T06:30:00.000Z') // 14:30 BJ
  assert.equal(isCnMondayAfterMarketClose(mondayBeforeClose), false)

  const tuesday = new Date('2026-07-14T08:00:00.000Z')
  assert.equal(isCnMondayAfterMarketClose(tuesday), false)

  const lastSync = { kline_daily: daysAgo(8) }
  assert.equal(cnKlineDailyMaintenanceDue(lastSync, mondayAfterClose), true)
  assert.equal(cnKlineDailyMaintenanceDue(lastSync, tuesday), false)
})

test('local offline screening flag matches build', () => {
  assert.equal(typeof LOCAL_OFFLINE_SCREENING_ENABLED, 'boolean')
})
