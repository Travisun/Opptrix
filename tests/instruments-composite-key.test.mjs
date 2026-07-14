import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, test } from 'node:test'
import Database from 'better-sqlite3'
import {
  MIGRATION_SQL,
  MIGRATION_V2_SQL,
  MIGRATION_V3_SQL,
  MIGRATION_V4_SQL,
  MIGRATION_V5_SQL,
  MIGRATION_V6_SQL,
  MIGRATION_V7_SQL,
  MIGRATION_V8_SQL,
  SCHEMA_VERSION,
} from '../packages/market-data/dist/schema.js'
import {
  migrate,
  normalizeInstrumentExchange,
  readDeclaredSchemaVersion,
  detectAppliedSchemaVersion,
} from '../packages/market-data/dist/utils.js'
import { isDuckPrimaryMigrationComplete } from '../packages/market-data/dist/duck/duck-primary-migration.js'
import { MarketDataStore } from '../packages/market-data/dist/store.js'
import { getMarketDuckGateway, resetMarketDuckGateways } from '../packages/market-data/dist/duck/market-duck-gateway.js'
import { resetDuckCliPools } from '../packages/market-data/dist/duck/duck-cli-pool.js'

let dataDir = ''

function duckGw(store) {
  return getMarketDuckGateway(store.klineDuckDbPath, store.dbPath)
}

function flushInstruments(store, where = '', params = []) {
  store.flushDuckWritesSync()
  const clause = where ? ` WHERE ${where}` : ''
  return duckGw(store).queryAllSync(
    `SELECT code, market, asset_class, name, exchange, instrument_ns FROM instruments${clause} ORDER BY asset_class, exchange`,
    params,
  )
}

function flushQuoteRow(store, tradeDate, code) {
  store.flushDuckWritesSync()
  return duckGw(store).queryOneSync(
    'SELECT instrument_ns, code FROM stock_quotes_daily WHERE trade_date = ? AND code = ?',
    [tradeDate, code],
  )
}

/** Seed a SQLite DB stopped after a given schema version (for thin upgrade smoke). */
function seedThroughVersion(dbPath, targetVersion, seedRows) {
  const db = new Database(dbPath)
  const ts = new Date().toISOString()
  const steps = [
    [1, MIGRATION_SQL],
    [2, MIGRATION_V2_SQL],
    [3, MIGRATION_V3_SQL],
    [4, MIGRATION_V4_SQL],
    [5, MIGRATION_V5_SQL],
    [6, MIGRATION_V6_SQL],
    [7, MIGRATION_V7_SQL],
    [8, MIGRATION_V8_SQL],
  ]
  for (const [v, sql] of steps) {
    if (v > targetVersion) break
    db.exec(sql)
    db.prepare('INSERT INTO schema_meta (version, applied_at) VALUES (?, ?)').run(v, ts)
  }
  seedRows?.(db, ts)
  db.close()
}

before(async () => {
  dataDir = await mkdtemp(join(tmpdir(), 'opmd-composite-'))
})

after(async () => {
  resetMarketDuckGateways()
  await resetDuckCliPools()
  if (dataDir) await rm(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
})

test('normalizeInstrumentExchange maps null to empty string', () => {
  assert.equal(normalizeInstrumentExchange(null), '')
  assert.equal(normalizeInstrumentExchange(undefined), '')
  assert.equal(normalizeInstrumentExchange('  '), '')
  assert.equal(normalizeInstrumentExchange('sz'), 'SZ')
})

test('fresh database uses schema v13 with duck primary migration complete', () => {
  const dbPath = join(dataDir, 'fresh-v9.db')
  const store = new MarketDataStore(dbPath, join(dataDir, 'fresh-v9.duckdb'))
  const ver = store.db.prepare('SELECT MAX(version) AS v FROM schema_meta').get()
  assert.equal(ver.v, SCHEMA_VERSION)
  assert.equal(SCHEMA_VERSION, 13)

  const ddl = store.db.prepare(
    "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'instruments'",
  ).get()
  assert.match(ddl.sql, /PRIMARY KEY \(market, exchange, code, asset_class\)/)

  const cols = store.db.prepare('PRAGMA table_info(instruments)').all()
  assert.ok(cols.some(c => c.name === 'instrument_ns'))

  const profileDdl = store.db.prepare(
    "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'stock_profiles'",
  ).get()
  assert.match(profileDdl.sql, /instrument_ns/)
  assert.match(profileDdl.sql, /REFERENCES instruments\(instrument_ns\)/)

  const duckPrimary = store.db.prepare(
    "SELECT meta_json FROM sync_cursor WHERE job_name = 'duck_primary_migration'",
  ).get()
  assert.match(duckPrimary?.meta_json ?? '', /complete/)
  assert.ok(isDuckPrimaryMigrationComplete(store.db))
  store.close()
})

test('same code with different exchange and asset_class can coexist', () => {
  const dbPath = join(dataDir, 'coexist.db')
  const store = new MarketDataStore(dbPath, join(dataDir, 'coexist.duckdb'))

  store.upsertInstrument({
    code: '000977',
    market: 'CN',
    assetClass: 'EQUITY',
    name: '浪潮信息',
    exchange: 'SZ',
    status: 'active',
  })
  store.upsertInstrument({
    code: '000977',
    market: 'CN',
    assetClass: 'INDEX',
    name: '中证500等权',
    exchange: 'SH',
    status: 'active',
  })

  const rows = flushInstruments(store, "code = '000977'")
  assert.equal(rows.length, 2)
  assert.deepEqual(
    rows.map(r => ({ asset_class: r.asset_class, exchange: r.exchange, name: r.name })),
    [
      { asset_class: 'EQUITY', exchange: 'SZ', name: '浪潮信息' },
      { asset_class: 'INDEX', exchange: 'SH', name: '中证500等权' },
    ],
  )

  store.flushDuckWritesSync()
  assert.equal(
    store.getInstrument({ market: 'CN', code: '000977', assetClass: 'EQUITY', exchange: 'SZ' })?.name,
    '浪潮信息',
  )
  assert.equal(
    store.getInstrument({ market: 'CN', code: '000977', assetClass: 'INDEX', exchange: 'SH' })?.name,
    '中证500等权',
  )
  store.close()
})

test('upsertInstrument updates only matching composite key', () => {
  const dbPath = join(dataDir, 'upsert-scope.db')
  const store = new MarketDataStore(dbPath, join(dataDir, 'upsert-scope.duckdb'))

  store.upsertInstrument({
    code: '000977',
    market: 'CN',
    assetClass: 'EQUITY',
    name: '浪潮信息',
    exchange: 'SZ',
  })
  store.upsertInstrument({
    code: '000977',
    market: 'CN',
    assetClass: 'INDEX',
    name: '旧指数名',
    exchange: 'SH',
  })
  store.upsertInstrument({
    code: '000977',
    market: 'CN',
    assetClass: 'EQUITY',
    name: '浪潮信息-更新',
    exchange: 'SZ',
  })

  store.flushDuckWritesSync()
  assert.equal(
    store.getInstrument({ market: 'CN', code: '000977', assetClass: 'EQUITY', exchange: 'SZ' })?.name,
    '浪潮信息-更新',
  )
  assert.equal(
    store.getInstrument({ market: 'CN', code: '000977', assetClass: 'INDEX', exchange: 'SH' })?.name,
    '旧指数名',
  )
  store.close()
})

test('v7 database upgrades to current schema preserving instruments', () => {
  const dbPath = join(dataDir, 'migrate-v7.db')
  seedThroughVersion(dbPath, 7, (db, ts) => {
    db.prepare(`
      INSERT INTO instruments (code, market, asset_class, name, exchange, status, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run('600519', 'CN', 'EQUITY', '贵州茅台', 'SH', 'active', ts)
  })

  const store = new MarketDataStore(dbPath)
  assert.equal(detectAppliedSchemaVersion(store.db), SCHEMA_VERSION)
  const row = store.getInstrument({ market: 'CN', code: '600519', assetClass: 'EQUITY', exchange: 'SH' })
  assert.equal(row?.name, '贵州茅台')
  assert.equal(row?.exchange, 'SH')
  store.close()
})

test('upsertStock writes CN equity with exchange in composite key', () => {
  const dbPath = join(dataDir, 'upsert-stock.db')
  const store = new MarketDataStore(dbPath, join(dataDir, 'upsert-stock.duckdb'))
  store.upsertStock({
    code: '000977',
    name: '浪潮信息',
    market: 'SZ',
    industry: '计算机',
    status: 'active',
  })

  store.flushDuckWritesSync()
  const inst = store.getInstrument({ market: 'CN', code: '000977', assetClass: 'EQUITY', exchange: 'SZ' })
  assert.equal(inst?.name, '浪潮信息')
  assert.equal(store.stockMeta('000977', 'SZ')?.name, '浪潮信息')
  store.close()
})

test('v8 database upgrades with instrument_ns backfill', () => {
  const dbPath = join(dataDir, 'migrate-v8-v9.db')
  seedThroughVersion(dbPath, 8, (db, ts) => {
    db.prepare(`
      INSERT INTO stocks (code, name, market, industry, is_st, status, updated_at)
      VALUES ('000977', '浪潮信息', 'SZ', '计算机', 0, 'active', ?)
    `).run(ts)
    db.prepare(`
      INSERT INTO instruments (code, market, asset_class, name, exchange, status, updated_at)
      VALUES ('000977', 'CN', 'EQUITY', '浪潮信息', 'SZ', 'active', ?)
    `).run(ts)
    db.prepare(`
      INSERT INTO stock_profiles (code, org_name, synced_at)
      VALUES ('000977', '浪潮信息股份有限公司', ?)
    `).run(ts)
  })

  const store = new MarketDataStore(dbPath)
  assert.equal(detectAppliedSchemaVersion(store.db), SCHEMA_VERSION)
  assert.equal(store.resolveCnEquityInstrumentNs('000977', 'SZ'), 'CN:SZ.000977')

  const inst = store.db.prepare(
    'SELECT instrument_ns FROM instruments WHERE code = ? AND market = ? AND asset_class = ?',
  ).get('000977', 'CN', 'EQUITY')
  assert.equal(inst.instrument_ns, 'CN:SZ.000977')

  const profile = store.db.prepare(
    'SELECT instrument_ns, code FROM stock_profiles WHERE instrument_ns = ?',
  ).get('CN:SZ.000977')
  assert.equal(profile?.code, '000977')
  store.close()
})

test('upsertStock dual-writes instrument_ns on child quote rows', () => {
  const dbPath = join(dataDir, 'dual-write-ns.db')
  const store = new MarketDataStore(dbPath, join(dataDir, 'dual-write-ns.duckdb'))
  store.upsertStock({
    code: '600519',
    name: '贵州茅台',
    market: 'SH',
    status: 'active',
  })
  store.upsertQuoteDaily('2026-07-10', '600519', { close: 1500, changePct: 1.2 })
  const row = flushQuoteRow(store, '2026-07-10', '600519')
  assert.equal(row?.instrument_ns, 'CN:SH.600519')
  store.close()
})

test('migrate is idempotent on current schema', () => {
  const dbPath = join(dataDir, 'idempotent.db')
  const store = new MarketDataStore(dbPath, join(dataDir, 'idempotent.duckdb'))
  store.upsertInstrument({
    code: '000001',
    market: 'CN',
    assetClass: 'EQUITY',
    name: '平安银行',
    exchange: 'SZ',
  })
  store.flushDuckWritesSync()
  const before = duckGw(store).queryOneSync(
    'SELECT COUNT(*)::INTEGER AS c FROM instruments',
    [],
  )?.c ?? 0
  migrate(store.db)
  migrate(store.db)
  store.flushDuckWritesSync()
  const after = duckGw(store).queryOneSync(
    'SELECT COUNT(*)::INTEGER AS c FROM instruments',
    [],
  )?.c ?? 0
  assert.equal(before, after)
  store.close()
})

test('stockMarket — composite exchange disambiguates same code', () => {
  const dbPath = join(dataDir, 'stock-market-composite.db')
  const store = new MarketDataStore(dbPath, join(dataDir, 'stock-market-composite.duckdb'))
  store.upsertInstrument({
    code: '000977',
    market: 'CN',
    assetClass: 'EQUITY',
    name: '浪潮信息',
    exchange: 'SZ',
    status: 'active',
  })
  store.upsertInstrument({
    code: '000977',
    market: 'CN',
    assetClass: 'INDEX',
    name: '内地低碳',
    exchange: 'SH',
    status: 'active',
  })

  store.flushDuckWritesSync()
  assert.equal(store.stockMarket('000977', 'SZ'), 'SZ')
  assert.equal(store.stockMarket('000977', 'SH'), null)
  assert.equal(store.stockMarketLookupKey('000977', 'SZ'), 'SZ:000977')
  store.close()
})

test('stockMarketBatch — exchangeByCode uses composite keys', () => {
  const dbPath = join(dataDir, 'stock-market-batch.db')
  const store = new MarketDataStore(dbPath, join(dataDir, 'stock-market-batch.duckdb'))
  store.upsertInstrument({
    code: '000977',
    market: 'CN',
    assetClass: 'EQUITY',
    name: '浪潮信息',
    exchange: 'SZ',
    status: 'active',
  })
  store.upsertStock({
    code: '600519',
    name: '贵州茅台',
    market: 'SH',
    status: 'active',
  })

  store.flushDuckWritesSync()
  const exchangeByCode = new Map([['000977', 'SZ']])
  const batch = store.stockMarketBatch(['000977', '600519'], exchangeByCode)
  assert.equal(batch.get('SZ:000977'), 'SZ')
  assert.equal(batch.get('600519'), 'SH')
  store.close()
})

test('declared and applied schema version stay in sync after migrate', () => {
  const dbPath = join(dataDir, 'version-sync.db')
  const store = new MarketDataStore(dbPath)
  assert.equal(readDeclaredSchemaVersion(store.db), SCHEMA_VERSION)
  assert.equal(detectAppliedSchemaVersion(store.db), SCHEMA_VERSION)
  store.close()
})

test('MIGRATION_STEPS count matches SCHEMA_VERSION', async () => {
  const { MIGRATION_STEPS } = await import('../packages/market-data/dist/schema-migrate.js')
  assert.equal(MIGRATION_STEPS.length, SCHEMA_VERSION)
  assert.deepEqual(
    MIGRATION_STEPS.map(s => s.version),
    Array.from({ length: SCHEMA_VERSION }, (_, i) => i + 1),
  )
})

test('cnRefFromCode resolves exchange from local store', async () => {
  const { cnRefFromCode } = await import('../packages/market-data/dist/sync/instrument-gateway.js')
  const dbPath = join(dataDir, 'cn-ref-from-code.db')
  const store = new MarketDataStore(dbPath)
  store.upsertInstrument({
    code: '000977',
    market: 'CN',
    assetClass: 'EQUITY',
    name: '浪潮信息',
    exchange: 'SZ',
    status: 'active',
  })

  const ref = cnRefFromCode(store, '000977')
  assert.equal(ref.market, 'CN')
  assert.equal(ref.symbol, '000977')
  assert.equal(ref.exchange, 'SZ')
  assert.equal(ref.assetClass, 'EQUITY')
  store.close()
})

test('backfill disambiguates duplicate instrument_ns before unique index', () => {
  const dbPath = join(dataDir, 'duplicate-ns.db')
  const store = new MarketDataStore(dbPath)
  const ts = new Date().toISOString()
  store.db.prepare(`
    INSERT INTO instruments (code, market, asset_class, name, exchange, status, updated_at)
    VALUES ('000977', 'CN', 'EQUITY', '浪潮信息', '', 'active', ?),
           ('000977', 'CN', 'INDEX', '内地低碳', '', 'active', ?)
  `).run(ts, ts)
  migrate(store.db)

  const rows = store.db.prepare(`
    SELECT asset_class, instrument_ns FROM instruments WHERE code = '000977' ORDER BY asset_class
  `).all()
  assert.equal(rows.length, 2)
  assert.equal(rows[0].instrument_ns, 'CN:SZ.000977')
  assert.equal(rows[1].instrument_ns, 'CN:SZ.000977@INDEX')
  store.close()
})

test('upsertInstrument disambiguates ETF when same code exists as EQUITY', () => {
  const dbPath = join(dataDir, 'etf-ns-disambig.db')
  const store = new MarketDataStore(dbPath, join(dataDir, 'etf-ns-disambig.duckdb'))
  store.upsertInstrument({
    code: '510300',
    market: 'CN',
    assetClass: 'EQUITY',
    name: '沪深300ETF',
    exchange: 'SH',
    status: 'active',
  })
  store.upsertInstrument({
    code: '510300',
    market: 'CN',
    assetClass: 'ETF',
    name: '华泰柏瑞沪深300ETF',
    exchange: 'SH',
    status: 'active',
  })
  store.flushDuckWritesSync()
  const rows = flushInstruments(store, "code = '510300'")
  assert.equal(rows.length, 2)
  assert.equal(rows.find(r => r.asset_class === 'EQUITY')?.instrument_ns, 'CN:SH.510300')
  assert.equal(rows.find(r => r.asset_class === 'ETF')?.instrument_ns, 'CN:SH.510300@ETF')
  store.close()
})

test('stock_profiles migration anchors FK via stocks-backed instrument row', () => {
  const dbPath = join(dataDir, 'profile-fk-anchor.db')
  seedThroughVersion(dbPath, 8, (db, ts) => {
    db.prepare(`
      INSERT INTO stocks (code, name, market, is_st, status, updated_at)
      VALUES ('999999', '测试 orphan', 'SZ', 0, 'active', ?)
    `).run(ts)
    db.prepare(`
      INSERT INTO stock_profiles (code, org_name, synced_at)
      VALUES ('999999', '测试公司', ?)
    `).run(ts)
  })

  const store = new MarketDataStore(dbPath)
  const profile = store.db.prepare(
    'SELECT instrument_ns, code FROM stock_profiles WHERE code = ?',
  ).get('999999')
  const inst = store.db.prepare(
    'SELECT instrument_ns FROM instruments WHERE market = ? AND asset_class = ? AND code = ?',
  ).get('CN', 'EQUITY', '999999')
  assert.equal(profile?.instrument_ns, 'CN:SZ.999999')
  assert.equal(inst?.instrument_ns, 'CN:SZ.999999')
  store.close()
})
