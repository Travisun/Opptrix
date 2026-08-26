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
  DEPRECATED_INSTRUMENT_CATALOG_SYNC_JOBS,
} from '../packages/market-data/dist/sync/config.js'
import {
  cnUniverseMaintenanceDue,
  cnTaxonomyMaintenanceDue,
  cnMaintenanceJobsDue,
  isCnMondayAfterMarketClose,
} from '../packages/market-data/dist/sync/schedule.js'

test('CN auto sync: no bootstrap or maintenance jobs (catalog + taxonomy offline)', () => {
  assert.deepEqual(CN_BOOTSTRAP_SYNC_JOBS, [])
  assert.deepEqual(CN_MAINTENANCE_SYNC_JOBS, [])
  assert.deepEqual(CN_AUTO_SYNC_JOB_UNIVERSE, [])
  assert.deepEqual(CN_CORE_SYNC_JOBS, [])
  assert.deepEqual(INITIAL_SYNC_JOBS, [])
  assert.deepEqual(BOOTSTRAP_SYNC_JOBS, [])
  assert.deepEqual(DEFAULT_AUTO_SYNC_JOBS, [])
  assert.deepEqual(DEFAULT_DAILY_SYNC_JOBS, [])
  assert.deepEqual(DAILY_SYNC_JOBS, [])
  assert.deepEqual(CN_MANUAL_SYNC_JOBS, [])
  assert.ok(!BOOTSTRAP_SYNC_JOBS.includes('kline_bootstrap'))
  assert.ok(!CN_MAINTENANCE_SYNC_JOBS.includes('kline_daily'))
  assert.ok(!BOOTSTRAP_SYNC_JOBS.includes('initial_cn_universe'))
  assert.ok(!BOOTSTRAP_SYNC_JOBS.includes('initial_taxonomy'))
  assert.deepEqual(STOCKINDEX_LIST_SYNC_JOBS, [])
  assert.deepEqual(LEGACY_INITIAL_SYNC_JOBS, [])
  assert.ok(DEPRECATED_INSTRUMENT_CATALOG_SYNC_JOBS.includes('initial_taxonomy'))
})

test('maintenance schedule: all catalog/taxonomy sync deprecated', () => {
  assert.equal(cnUniverseMaintenanceDue({}), false)
  assert.equal(cnTaxonomyMaintenanceDue({}), false)
  assert.deepEqual(cnMaintenanceJobsDue({}), [])
  assert.deepEqual(cnMaintenanceJobsDue({ initial_taxonomy: new Date().toISOString() }), [])
})

test('Monday after CN market close helper still works', () => {
  const mondayAfterClose = new Date('2026-07-13T08:00:00.000Z') // 16:00 BJ
  assert.equal(isCnMondayAfterMarketClose(mondayAfterClose), true)

  const mondayBeforeClose = new Date('2026-07-13T06:30:00.000Z') // 14:30 BJ
  assert.equal(isCnMondayAfterMarketClose(mondayBeforeClose), false)

  const tuesday = new Date('2026-07-14T08:00:00.000Z')
  assert.equal(isCnMondayAfterMarketClose(tuesday), false)
})
