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
  STOCKINDEX_LIST_SYNC_JOBS,
  SYNC_JOB_CONFIG,
} from '../packages/market-data/dist/sync/config.js'
import {
  cnUniverseMaintenanceDue,
  cnTaxonomyMaintenanceDue,
  cnMaintenanceJobsDue,
  isCnMondayAfterMarketClose,
} from '../packages/market-data/dist/sync/schedule.js'

const daysAgo = n => new Date(Date.now() - n * 86400000).toISOString()

test('CN auto sync: bootstrap is universe + taxonomy only (no static kline jobs)', () => {
  assert.deepEqual(CN_BOOTSTRAP_SYNC_JOBS, [
    'initial_cn_universe',
    'initial_cn_etf',
    'initial_hk_universe',
    'initial_us_universe',
    'initial_taxonomy',
  ])
  assert.deepEqual(CN_MAINTENANCE_SYNC_JOBS, [
    'initial_cn_universe',
    'initial_cn_etf',
    'initial_hk_universe',
    'initial_us_universe',
    'initial_taxonomy',
  ])
  assert.deepEqual(CN_AUTO_SYNC_JOB_UNIVERSE, [...CN_BOOTSTRAP_SYNC_JOBS])
  assert.deepEqual(CN_CORE_SYNC_JOBS, ['initial_cn_universe', 'initial_taxonomy'])
  assert.deepEqual(INITIAL_SYNC_JOBS, [...CN_BOOTSTRAP_SYNC_JOBS])
  assert.deepEqual(BOOTSTRAP_SYNC_JOBS, [...CN_BOOTSTRAP_SYNC_JOBS])
  assert.deepEqual(DEFAULT_AUTO_SYNC_JOBS, [...CN_BOOTSTRAP_SYNC_JOBS])
  assert.deepEqual(DEFAULT_DAILY_SYNC_JOBS, [...CN_MAINTENANCE_SYNC_JOBS])
  assert.deepEqual(DAILY_SYNC_JOBS, [...CN_MAINTENANCE_SYNC_JOBS])
  assert.deepEqual(CN_MANUAL_SYNC_JOBS, [...CN_BOOTSTRAP_SYNC_JOBS])
  assert.ok(!BOOTSTRAP_SYNC_JOBS.includes('kline_bootstrap'))
  assert.ok(!CN_MAINTENANCE_SYNC_JOBS.includes('kline_daily'))
  assert.ok(BOOTSTRAP_SYNC_JOBS.includes('initial_hk_universe'))
  assert.deepEqual(STOCKINDEX_LIST_SYNC_JOBS, [
    'initial_cn_etf',
    'initial_hk_universe',
    'initial_us_universe',
  ])
  assert.deepEqual(LEGACY_INITIAL_SYNC_JOBS, [...STOCKINDEX_LIST_SYNC_JOBS])
})

test('CN sync TTL: universe weekly, taxonomy weekly staggered', () => {
  assert.equal(SYNC_JOB_CONFIG.initial_cn_universe.ttlDays, 7)
  assert.equal(SYNC_JOB_CONFIG.initial_taxonomy.ttlDays, 7)
})

test('maintenance schedule: universe and taxonomy alternate weekly; no kline_daily', () => {
  const base = {
    initial_cn_universe: daysAgo(8),
    initial_taxonomy: daysAgo(1),
  }
  assert.equal(cnUniverseMaintenanceDue(base), false)
  assert.equal(cnTaxonomyMaintenanceDue(base), false)

  const taxDue = {
    initial_cn_universe: daysAgo(8),
    initial_taxonomy: daysAgo(8),
  }
  const jobs = cnMaintenanceJobsDue(taxDue)
  assert.ok(jobs.includes('initial_cn_universe') || jobs.includes('initial_taxonomy'))
  assert.ok(jobs.includes('initial_cn_etf'))
  assert.ok(jobs.includes('initial_hk_universe'))
  assert.ok(jobs.includes('initial_us_universe'))
  assert.ok(!jobs.includes('kline_daily'))

  const firstTaxonomy = {
    initial_cn_universe: daysAgo(1),
    initial_taxonomy: null,
  }
  assert.equal(cnTaxonomyMaintenanceDue(firstTaxonomy), true)
})

test('Monday after CN market close helper still works', () => {
  const mondayAfterClose = new Date('2026-07-13T08:00:00.000Z') // 16:00 BJ
  assert.equal(isCnMondayAfterMarketClose(mondayAfterClose), true)

  const mondayBeforeClose = new Date('2026-07-13T06:30:00.000Z') // 14:30 BJ
  assert.equal(isCnMondayAfterMarketClose(mondayBeforeClose), false)

  const tuesday = new Date('2026-07-14T08:00:00.000Z')
  assert.equal(isCnMondayAfterMarketClose(tuesday), false)
})
