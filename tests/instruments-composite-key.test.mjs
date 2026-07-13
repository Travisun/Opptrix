import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
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
import { migrate, normalizeInstrumentExchange, readDeclaredSchemaVersion, detectAppliedSchemaVersion, hasInstrumentCompositeKey } from '../packages/market-data/dist/utils.js'
import { MarketDataStore } from '../packages/market-data/dist/store.js'
import { getMarketDuckGateway } from '../packages/market-data/dist/duck/market-duck-gateway.js'
import { importMarketDataPackageToDisk, PACKAGE_APP_ID, PACKAGE_FORMAT_VERSION, PACKAGE_KIND } from '../packages/market-data/dist/package.js'

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

/** 构造指定声明版本的老库（仅写 schema_meta + 逐步 SQL） */
function seedDatabaseThroughVersion(dbPath, targetVersion, seedRows) {
  const db = new Database(dbPath)
  const ts = new Date().toISOString()
  db.exec(MIGRATION_SQL)
  db.prepare('INSERT INTO schema_meta (version, applied_at) VALUES (?, ?)').run(1, ts)
  const steps = [
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
  if (dataDir) await rm(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
})

test('normalizeInstrumentExchange maps null to empty string', () => {
  assert.equal(normalizeInstrumentExchange(null), '')
  assert.equal(normalizeInstrumentExchange(undefined), '')
  assert.equal(normalizeInstrumentExchange('  '), '')
  assert.equal(normalizeInstrumentExchange('sz'), 'SZ')
})

test('fresh database uses schema v12 with instrument_ns and market_data_storage', () => {
  const dbPath = join(dataDir, 'fresh-v9.db')
  const store = new MarketDataStore(dbPath, join(dataDir, 'fresh-v9.duckdb'))
  const ver = store.db.prepare('SELECT MAX(version) AS v FROM schema_meta').get()
  assert.equal(ver.v, SCHEMA_VERSION)
  assert.equal(SCHEMA_VERSION, 12)

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

  const klineStorage = store.db.prepare(
    "SELECT meta_json FROM sync_cursor WHERE job_name = 'kline_storage'",
  ).get()
  assert.match(klineStorage?.meta_json ?? '', /duckdb/)
  const analyticsStorage = store.db.prepare(
    "SELECT meta_json FROM sync_cursor WHERE job_name = 'analytics_storage'",
  ).get()
  assert.match(analyticsStorage?.meta_json ?? '', /dims/)
  const marketDataStorage = store.db.prepare(
    "SELECT meta_json FROM sync_cursor WHERE job_name = 'market_data_storage'",
  ).get()
  assert.match(marketDataStorage?.meta_json ?? '', /duckdb/)
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
  const equity = store.getInstrument({ market: 'CN', code: '000977', assetClass: 'EQUITY', exchange: 'SZ' })
  const index = store.getInstrument({ market: 'CN', code: '000977', assetClass: 'INDEX', exchange: 'SH' })
  assert.equal(equity?.name, '浪潮信息')
  assert.equal(index?.name, '中证500等权')
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

test('v7 database migrates to v8 preserving instrument rows', () => {
  const dbPath = join(dataDir, 'migrate-v7.db')
  const db = new Database(dbPath)
  db.exec(MIGRATION_SQL)
  db.prepare('INSERT INTO schema_meta (version, applied_at) VALUES (?, ?)').run(1, new Date().toISOString())
  db.exec(MIGRATION_V2_SQL)
  db.prepare('INSERT INTO schema_meta (version, applied_at) VALUES (?, ?)').run(2, new Date().toISOString())
  db.exec(MIGRATION_V3_SQL)
  db.prepare('INSERT INTO schema_meta (version, applied_at) VALUES (?, ?)').run(3, new Date().toISOString())
  db.exec(MIGRATION_V4_SQL)
  db.prepare('INSERT INTO schema_meta (version, applied_at) VALUES (?, ?)').run(4, new Date().toISOString())
  db.exec(MIGRATION_V5_SQL)
  db.prepare('INSERT INTO schema_meta (version, applied_at) VALUES (?, ?)').run(5, new Date().toISOString())
  db.exec(MIGRATION_V6_SQL)
  db.prepare('INSERT INTO schema_meta (version, applied_at) VALUES (?, ?)').run(6, new Date().toISOString())
  db.exec(MIGRATION_V7_SQL)
  db.prepare('INSERT INTO schema_meta (version, applied_at) VALUES (?, ?)').run(7, new Date().toISOString())

  const ts = new Date().toISOString()
  db.prepare(`
    INSERT INTO instruments (code, market, asset_class, name, exchange, status, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run('600519', 'CN', 'EQUITY', '贵州茅台', 'SH', 'active', ts)
  db.close()

  const store = new MarketDataStore(dbPath)
  const ver = store.db.prepare('SELECT MAX(version) AS v FROM schema_meta').get()
  assert.equal(ver.v, SCHEMA_VERSION)

  const row = store.getInstrument({ market: 'CN', code: '600519', assetClass: 'EQUITY', exchange: 'SH' })
  assert.equal(row?.name, '贵州茅台')
  assert.equal(row?.exchange, 'SH')

  const ddl = store.db.prepare(
    "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'instruments'",
  ).get()
  assert.match(ddl.sql, /PRIMARY KEY \(market, exchange, code, asset_class\)/)
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

test('v8 database migrates to v9 with instrument_ns backfill', () => {
  const dbPath = join(dataDir, 'migrate-v8-v9.db')
  const db = new Database(dbPath)
  db.exec(MIGRATION_SQL)
  db.prepare('INSERT INTO schema_meta (version, applied_at) VALUES (?, ?)').run(1, new Date().toISOString())
  db.exec(MIGRATION_V2_SQL)
  db.prepare('INSERT INTO schema_meta (version, applied_at) VALUES (?, ?)').run(2, new Date().toISOString())
  db.exec(MIGRATION_V3_SQL)
  db.prepare('INSERT INTO schema_meta (version, applied_at) VALUES (?, ?)').run(3, new Date().toISOString())
  db.exec(MIGRATION_V4_SQL)
  db.prepare('INSERT INTO schema_meta (version, applied_at) VALUES (?, ?)').run(4, new Date().toISOString())
  db.exec(MIGRATION_V5_SQL)
  db.prepare('INSERT INTO schema_meta (version, applied_at) VALUES (?, ?)').run(5, new Date().toISOString())
  db.exec(MIGRATION_V6_SQL)
  db.prepare('INSERT INTO schema_meta (version, applied_at) VALUES (?, ?)').run(6, new Date().toISOString())
  db.exec(MIGRATION_V7_SQL)
  db.prepare('INSERT INTO schema_meta (version, applied_at) VALUES (?, ?)').run(7, new Date().toISOString())
  db.exec(MIGRATION_V8_SQL)
  db.prepare('INSERT INTO schema_meta (version, applied_at) VALUES (?, ?)').run(8, new Date().toISOString())

  const ts = new Date().toISOString()
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
  db.close()

  const store = new MarketDataStore(dbPath)
  const ver = store.db.prepare('SELECT MAX(version) AS v FROM schema_meta').get()
  assert.equal(ver.v, SCHEMA_VERSION)

  const ns = store.resolveCnEquityInstrumentNs('000977', 'SZ')
  assert.equal(ns, 'CN:SZ.000977')

  const inst = store.db.prepare(
    'SELECT instrument_ns FROM instruments WHERE code = ? AND market = ? AND asset_class = ?',
  ).get('000977', 'CN', 'EQUITY')
  assert.equal(inst.instrument_ns, 'CN:SZ.000977')

  const profile = store.db.prepare(
    'SELECT instrument_ns, code FROM stock_profiles WHERE instrument_ns = ?',
  ).get('CN:SZ.000977')
  assert.equal(profile?.code, '000977')

  const finCols = store.db.prepare('PRAGMA table_info(stock_financials)').all()
  assert.ok(finCols.some(c => c.name === 'instrument_ns'))
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

test('migrate is idempotent on v9 database', () => {
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

test('v3 database leaps to latest schema', () => {
  const dbPath = join(dataDir, 'leap-v3.db')
  seedDatabaseThroughVersion(dbPath, 3, (db, ts) => {
    db.prepare(`
      INSERT INTO stocks (code, name, market, is_st, status, updated_at)
      VALUES ('000001', '平安银行', 'SZ', 0, 'active', ?)
    `).run(ts)
  })
  const store = new MarketDataStore(dbPath)
  assert.equal(readDeclaredSchemaVersion(store.db), SCHEMA_VERSION)
  assert.equal(detectAppliedSchemaVersion(store.db), SCHEMA_VERSION)
  const inst = store.db.prepare(
    'SELECT instrument_ns FROM instruments WHERE code = ? AND market = ? AND asset_class = ?',
  ).get('000001', 'CN', 'EQUITY')
  assert.equal(inst?.instrument_ns, 'CN:SZ.000001')
  store.close()
})

test('v5 database leaps to latest schema', () => {
  const dbPath = join(dataDir, 'leap-v5.db')
  seedDatabaseThroughVersion(dbPath, 5, (db, ts) => {
    db.prepare(`
      INSERT INTO stocks (code, name, market, is_st, status, updated_at)
      VALUES ('600036', '招商银行', 'SH', 0, 'active', ?)
    `).run(ts)
  })
  const store = new MarketDataStore(dbPath)
  assert.equal(detectAppliedSchemaVersion(store.db), SCHEMA_VERSION)
  store.close()
})

test('schema_meta ahead of DDL self-heals on open', () => {
  const dbPath = join(dataDir, 'meta-ahead.db')
  const ts = new Date().toISOString()
  seedDatabaseThroughVersion(dbPath, 8, (d, t) => {
    d.prepare(`
      INSERT INTO stocks (code, name, market, is_st, status, updated_at)
      VALUES ('601318', '中国平安', 'SH', 0, 'active', ?)
    `).run(t)
  })
  const db = new Database(dbPath)
  db.exec('ALTER TABLE instruments ADD COLUMN instrument_ns TEXT')
  db.prepare('INSERT INTO schema_meta (version, applied_at) VALUES (?, ?)').run(9, ts)
  const finHasNsBefore = db.prepare('PRAGMA table_info(stock_financials)').all()
    .some(c => c.name === 'instrument_ns')
  assert.equal(finHasNsBefore, false)
  db.close()

  const store = new MarketDataStore(dbPath)
  const finHasNsAfter = store.db.prepare('PRAGMA table_info(stock_financials)').all()
    .some(c => c.name === 'instrument_ns')
  assert.ok(finHasNsAfter)
  assert.equal(detectAppliedSchemaVersion(store.db), SCHEMA_VERSION)
  store.close()
})

test('partial v9 schema recovers missing child columns', () => {
  const dbPath = join(dataDir, 'partial-v9-recover.db')
  const db = new Database(dbPath)
  const ts = new Date().toISOString()
  db.exec(MIGRATION_SQL)
  db.prepare('INSERT INTO schema_meta (version, applied_at) VALUES (?, ?)').run(1, ts)
  for (const [v, sql] of [
    [2, MIGRATION_V2_SQL],
    [3, MIGRATION_V3_SQL],
    [4, MIGRATION_V4_SQL],
    [5, MIGRATION_V5_SQL],
    [6, MIGRATION_V6_SQL],
    [7, MIGRATION_V7_SQL],
    [8, MIGRATION_V8_SQL],
  ]) {
    db.exec(sql)
    db.prepare('INSERT INTO schema_meta (version, applied_at) VALUES (?, ?)').run(v, ts)
  }
  db.exec('ALTER TABLE instruments ADD COLUMN instrument_ns TEXT')
  db.prepare('INSERT INTO schema_meta (version, applied_at) VALUES (?, ?)').run(9, ts)
  db.close()

  const store = new MarketDataStore(dbPath)
  const finHasNs = store.db.prepare('PRAGMA table_info(stock_financials)').all()
    .some(c => c.name === 'instrument_ns')
  const partnersHasNs = store.db.prepare('PRAGMA table_info(stock_partners)').all()
    .some(c => c.name === 'instrument_ns')
  assert.ok(finHasNs)
  assert.ok(partnersHasNs)
  store.close()
})

test('v1 database leaps to v9 preserving stock child data', () => {
  const dbPath = join(dataDir, 'leap-v1-v9.db')
  const db = new Database(dbPath)
  const ts = new Date().toISOString()
  db.exec(MIGRATION_SQL)
  db.prepare('INSERT INTO schema_meta (version, applied_at) VALUES (?, ?)').run(1, ts)
  db.prepare(`
    INSERT INTO stocks (code, name, market, industry, is_st, status, updated_at)
    VALUES ('600519', '贵州茅台', 'SH', '白酒', 0, 'active', ?)
  `).run(ts)
  db.prepare(`
    INSERT INTO stock_quotes_daily (trade_date, code, close, synced_at)
    VALUES ('2026-01-02', '600519', 1800, ?)
  `).run(ts)
  db.close()

  const store = new MarketDataStore(dbPath)
  const ver = store.db.prepare('SELECT MAX(version) AS v FROM schema_meta').get()
  assert.equal(ver.v, SCHEMA_VERSION)
  const quote = store.db.prepare(
    'SELECT instrument_ns FROM stock_quotes_daily WHERE code = ?',
  ).get('600519')
  assert.equal(quote.instrument_ns, 'CN:SH.600519')
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

test('meta v9 ahead of v8 composite self-heals on open', () => {
  const dbPath = join(dataDir, 'meta9-no-composite.db')
  const ts = new Date().toISOString()
  seedDatabaseThroughVersion(dbPath, 7, (db, t) => {
    db.prepare(`
      INSERT INTO stocks (code, name, market, is_st, status, updated_at)
      VALUES ('601318', '中国平安', 'SH', 0, 'active', ?)
    `).run(t)
  })
  const db = new Database(dbPath)
  db.exec('ALTER TABLE instruments ADD COLUMN instrument_ns TEXT')
  db.prepare('INSERT INTO schema_meta (version, applied_at) VALUES (?, ?)').run(9, ts)
  assert.equal(hasInstrumentCompositeKey(db), false)
  assert.equal(readDeclaredSchemaVersion(db), 9)
  db.close()

  const store = new MarketDataStore(dbPath)
  assert.equal(hasInstrumentCompositeKey(store.db), true)
  assert.equal(detectAppliedSchemaVersion(store.db), SCHEMA_VERSION)
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

  store.db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_test_ns ON instruments(instrument_ns)')
  store.close()
})

test('upsertInstrument disambiguates ETF when same code exists as EQUITY', () => {
  const dbPath = join(dataDir, 'etf-ns-disambig.db')
  const store = new MarketDataStore(dbPath, join(dataDir, 'etf-ns-disambig.duckdb'))
  const ts = new Date().toISOString()
  store.db.prepare(`
    INSERT INTO instruments (code, market, asset_class, name, exchange, status, updated_at, instrument_ns)
    VALUES ('510300', 'CN', 'EQUITY', '沪深300ETF', 'SH', 'active', ?, 'CN:SH.510300')
  `).run(ts)
  store.upsertInstrument({
    code: '510300',
    market: 'CN',
    assetClass: 'ETF',
    name: '华泰柏瑞沪深300ETF',
    exchange: 'SH',
    status: 'active',
  })
  store.prepareForSqliteExport()
  const rows = store.db.prepare(`
    SELECT asset_class, instrument_ns FROM instruments WHERE code = '510300' ORDER BY asset_class
  `).all()
  assert.equal(rows.length, 2)
  assert.equal(rows.find(r => r.asset_class === 'EQUITY')?.instrument_ns, 'CN:SH.510300')
  assert.equal(rows.find(r => r.asset_class === 'ETF')?.instrument_ns, 'CN:SH.510300@ETF')
  store.close()
})

test('stock_profiles migration anchors FK via stocks-backed instrument row', () => {
  const dbPath = join(dataDir, 'profile-fk-anchor.db')
  const db = new Database(dbPath)
  const ts = new Date().toISOString()
  for (const [v, sql] of [
    [1, MIGRATION_SQL],
    [2, MIGRATION_V2_SQL],
    [3, MIGRATION_V3_SQL],
    [4, MIGRATION_V4_SQL],
    [5, MIGRATION_V5_SQL],
    [6, MIGRATION_V6_SQL],
    [7, MIGRATION_V7_SQL],
    [8, MIGRATION_V8_SQL],
  ]) {
    db.exec(sql)
    db.prepare('INSERT INTO schema_meta (version, applied_at) VALUES (?, ?)').run(v, ts)
  }
  db.prepare(`
    INSERT INTO stocks (code, name, market, is_st, status, updated_at)
    VALUES ('999999', '测试 orphan', 'SZ', 0, 'active', ?)
  `).run(ts)
  db.prepare(`
    INSERT INTO stock_profiles (code, org_name, synced_at)
    VALUES ('999999', '测试公司', ?)
  `).run(ts)
  db.close()

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

test('v8 re-run preserves instrument_ns column values', async () => {
  const { MIGRATION_STEPS } = await import('../packages/market-data/dist/schema-migrate.js')
  const dbPath = join(dataDir, 'v8-preserve-ns.db')
  seedDatabaseThroughVersion(dbPath, 8, (db, t) => {
    db.prepare(`
      INSERT INTO instruments (code, market, asset_class, name, exchange, status, updated_at)
      VALUES ('600519', 'CN', 'EQUITY', '贵州茅台', 'SH', 'active', ?)
    `).run(t)
  })
  const db = new Database(dbPath)
  db.exec('ALTER TABLE instruments ADD COLUMN instrument_ns TEXT')
  db.prepare(`
    UPDATE instruments SET instrument_ns = 'CUSTOM:CN:SH.600519'
    WHERE code = '600519' AND market = 'CN' AND asset_class = 'EQUITY'
  `).run()
  db.exec(`
    CREATE TABLE instruments_old AS SELECT * FROM instruments;
    DROP TABLE instruments;
    CREATE TABLE instruments (
      code TEXT PRIMARY KEY,
      market TEXT NOT NULL,
      asset_class TEXT NOT NULL,
      name TEXT,
      exchange TEXT,
      list_date TEXT,
      delist_date TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      extra TEXT,
      updated_at TEXT NOT NULL,
      instrument_ns TEXT
    );
    INSERT INTO instruments SELECT * FROM instruments_old;
    DROP TABLE instruments_old;
  `)
  db.prepare('DELETE FROM schema_meta WHERE version >= 8').run()

  const step8 = MIGRATION_STEPS.find(s => s.version === 8)
  step8.up(db)
  const row = db.prepare(
    'SELECT instrument_ns FROM instruments WHERE code = ? AND market = ? AND asset_class = ?',
  ).get('600519', 'CN', 'EQUITY')
  assert.equal(row?.instrument_ns, 'CUSTOM:CN:SH.600519')
  assert.equal(hasInstrumentCompositeKey(db), true)
  db.close()
})

function buildMinimalOpmdPackage(sqlitePath, schemaVersion) {
  const sqlite = readFileSync(sqlitePath)
  const payloadGzip = gzipSync(sqlite, { level: 6 })
  const payloadSha256 = createHash('sha256').update(payloadGzip).digest()
  const packSignature = createHash('sha256')
    .update(`opptrix|OPMD|v1|${payloadSha256.toString('hex')}`)
    .digest('hex')
    .slice(0, 32)
  const metadata = {
    app: PACKAGE_APP_ID,
    kind: PACKAGE_KIND,
    format_version: PACKAGE_FORMAT_VERSION,
    exported_at: new Date().toISOString(),
    schema_version: schemaVersion,
    pack_signature: packSignature,
    compatible: {
      min_format_version: 1,
      max_format_version: PACKAGE_FORMAT_VERSION,
      min_schema_version: 1,
      max_schema_version: SCHEMA_VERSION,
    },
    snapshot: {
      stock_count: 1,
      latest_trade_date: null,
      latest_factor_date: null,
      is_ready: false,
      bootstrap: { stocks: false, factors: false, scores: false },
    },
  }
  const metadataJson = Buffer.from(JSON.stringify(metadata), 'utf8')
  const exportedAtMs = Date.parse(metadata.exported_at)
  const header = Buffer.alloc(68)
  header.write('OPMD', 0, 4, 'ascii')
  header.writeUInt32LE(PACKAGE_FORMAT_VERSION, 4)
  header.writeBigUInt64LE(BigInt(Number.isFinite(exportedAtMs) ? exportedAtMs : Date.now()), 8)
  header.writeUInt32LE(schemaVersion, 16)
  header.writeUInt32LE(metadataJson.length, 20)
  header.writeBigUInt64LE(BigInt(payloadGzip.length), 24)
  payloadSha256.copy(header, 32, 0, 32)
  return Buffer.concat([header, metadataJson, payloadGzip])
}

test('importMarketDataPackage auto-migrates old schema on open', async () => {
  const sourcePath = join(dataDir, 'import-source-v7.db')
  seedDatabaseThroughVersion(sourcePath, 5, (db, t) => {
    db.prepare(`
      INSERT INTO stocks (code, name, market, is_st, status, updated_at)
      VALUES ('600036', '招商银行', 'SH', 0, 'active', ?)
    `).run(t)
  })
  {
    const db = new Database(sourcePath)
    const ts = new Date().toISOString()
    db.exec(MIGRATION_V6_SQL)
    db.prepare('INSERT INTO schema_meta (version, applied_at) VALUES (?, ?)').run(6, ts)
    db.exec(MIGRATION_V7_SQL)
    db.prepare('INSERT INTO schema_meta (version, applied_at) VALUES (?, ?)').run(7, ts)
    db.close()
  }
  const pkg = buildMinimalOpmdPackage(sourcePath, 7)

  const importPath = join(dataDir, 'import-target.db')
  importMarketDataPackageToDisk(pkg, { dbPath: importPath, backup: false })

  const store = new MarketDataStore(importPath)
  assert.equal(detectAppliedSchemaVersion(store.db), SCHEMA_VERSION)
  const inst = store.db.prepare(
    'SELECT instrument_ns FROM instruments WHERE code = ? AND market = ? AND asset_class = ?',
  ).get('600036', 'CN', 'EQUITY')
  assert.equal(inst?.instrument_ns, 'CN:SH.600036')
  store.close()
})
