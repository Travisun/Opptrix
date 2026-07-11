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
import { migrate, normalizeInstrumentExchange } from '../packages/market-data/dist/utils.js'
import { MarketDataStore } from '../packages/market-data/dist/store.js'

let dataDir = ''

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

test('fresh database uses schema v9 with instrument_ns', () => {
  const dbPath = join(dataDir, 'fresh-v9.db')
  const store = new MarketDataStore(dbPath)
  const ver = store.db.prepare('SELECT MAX(version) AS v FROM schema_meta').get()
  assert.equal(ver.v, SCHEMA_VERSION)
  assert.equal(SCHEMA_VERSION, 9)

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
  store.close()
})

test('same code with different exchange and asset_class can coexist', () => {
  const dbPath = join(dataDir, 'coexist.db')
  const store = new MarketDataStore(dbPath)

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

  const rows = store.db.prepare(`
    SELECT code, asset_class, exchange, name FROM instruments WHERE code = '000977' ORDER BY asset_class
  `).all()
  assert.equal(rows.length, 2)
  assert.deepEqual(
    rows.map(r => ({ asset_class: r.asset_class, exchange: r.exchange, name: r.name })),
    [
      { asset_class: 'EQUITY', exchange: 'SZ', name: '浪潮信息' },
      { asset_class: 'INDEX', exchange: 'SH', name: '中证500等权' },
    ],
  )

  const equity = store.getInstrument({ market: 'CN', code: '000977', assetClass: 'EQUITY', exchange: 'SZ' })
  const index = store.getInstrument({ market: 'CN', code: '000977', assetClass: 'INDEX', exchange: 'SH' })
  assert.equal(equity?.name, '浪潮信息')
  assert.equal(index?.name, '中证500等权')
  store.close()
})

test('upsertInstrument updates only matching composite key', () => {
  const dbPath = join(dataDir, 'upsert-scope.db')
  const store = new MarketDataStore(dbPath)

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
  assert.equal(ver.v, 9)

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
  const store = new MarketDataStore(dbPath)
  store.upsertStock({
    code: '000977',
    name: '浪潮信息',
    market: 'SZ',
    industry: '计算机',
    status: 'active',
  })

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
  assert.equal(ver.v, 9)

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
  const store = new MarketDataStore(dbPath)
  store.upsertStock({
    code: '600519',
    name: '贵州茅台',
    market: 'SH',
    status: 'active',
  })
  store.upsertQuoteDaily('2026-07-10', '600519', { close: 1500, changePct: 1.2 })
  const row = store.db.prepare(
    'SELECT instrument_ns, code FROM stock_quotes_daily WHERE trade_date = ? AND code = ?',
  ).get('2026-07-10', '600519')
  assert.equal(row.instrument_ns, 'CN:SH.600519')
  store.close()
})

test('migrate is idempotent on v9 database', () => {
  const dbPath = join(dataDir, 'idempotent.db')
  const store = new MarketDataStore(dbPath)
  store.upsertInstrument({
    code: '000001',
    market: 'CN',
    assetClass: 'EQUITY',
    name: '平安银行',
    exchange: 'SZ',
  })
  const before = store.db.prepare('SELECT COUNT(*) AS c FROM instruments').get().c
  migrate(store.db)
  migrate(store.db)
  const after = store.db.prepare('SELECT COUNT(*) AS c FROM instruments').get().c
  assert.equal(before, after)
  store.close()
})

test('stockMarket — composite exchange disambiguates same code', () => {
  const dbPath = join(dataDir, 'stock-market-composite.db')
  const store = new MarketDataStore(dbPath)
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

  assert.equal(store.stockMarket('000977', 'SZ'), 'SZ')
  assert.equal(store.stockMarket('000977', 'SH'), null)
  assert.equal(store.stockMarketLookupKey('000977', 'SZ'), 'SZ:000977')
  store.close()
})

test('stockMarketBatch — exchangeByCode uses composite keys', () => {
  const dbPath = join(dataDir, 'stock-market-batch.db')
  const store = new MarketDataStore(dbPath)
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

  const exchangeByCode = new Map([['000977', 'SZ']])
  const batch = store.stockMarketBatch(['000977', '600519'], exchangeByCode)
  assert.equal(batch.get('SZ:000977'), 'SZ')
  assert.equal(batch.get('600519'), 'SH')
  store.close()
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
