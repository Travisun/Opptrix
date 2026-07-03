import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, test } from 'node:test'
import {
  exportMarketDataPackage,
  importMarketDataPackageToDisk,
  inspectMarketDataPackage,
  PACKAGE_MAGIC,
  suggestPackageFilename,
} from '../packages/market-data/dist/package.js'
import { MarketDataStore } from '../packages/market-data/dist/store.js'

let dataDir = ''

before(async () => {
  dataDir = await mkdtemp(join(tmpdir(), 'opmd-test-'))
  process.env.OPPTRIX_DATA_DIR = dataDir
  process.env.OPPTRIX_MARKET_DB_PATH = join(dataDir, 'market.db')
})

after(async () => {
  if (dataDir) await rm(dataDir, { recursive: true, force: true })
})

test('market data package round-trip preserves stock universe', async () => {
  const dbPath = join(dataDir, 'market-roundtrip.db')
  const store = new MarketDataStore(dbPath)
  store.upsertStock({
    code: '600519',
    name: '贵州茅台',
    market: 'SH',
    industry: '白酒',
    is_st: false,
    status: 'active',
  })
  store.upsertQuoteDaily('2026-06-28', '600519', {
    code: '600519',
    name: '贵州茅台',
    price: 1700,
    changePct: 1.2,
  })

  const pack = await exportMarketDataPackage(store)
  assert.ok(pack.subarray(0, 4).equals(Buffer.from(PACKAGE_MAGIC)))

  const inspect = inspectMarketDataPackage(pack)
  assert.equal(inspect.valid, true)
  assert.equal(inspect.metadata?.app, 'opptrix')
  assert.equal(inspect.metadata?.snapshot.stock_count, 1)
  assert.ok(suggestPackageFilename(inspect.metadata).endsWith('.opmd'))

  store.close()

  const importPath = join(dataDir, 'market-imported.db')
  const metadata = importMarketDataPackageToDisk(pack, { dbPath: importPath, backup: false })
  assert.equal(metadata.snapshot.stock_count, 1)

  const reopened = new MarketDataStore(importPath)
  const row = reopened.db.prepare('SELECT name FROM stocks WHERE code = ?').get('600519')
  assert.equal(row?.name, '贵州茅台')
  reopened.close()
})

test('market data package rejects tampered payload', async () => {
  const dbPath = join(dataDir, 'market-tamper.db')
  const store = new MarketDataStore(dbPath)
  store.upsertStock({
    code: '000001',
    name: '平安银行',
    market: 'SZ',
    industry: '银行',
    is_st: false,
    status: 'active',
  })
  const pack = await exportMarketDataPackage(store)
  store.close()

  const tampered = Buffer.from(pack)
  tampered[tampered.length - 1] ^= 0xff
  const inspect = inspectMarketDataPackage(tampered)
  assert.equal(inspect.valid, false)
  assert.ok(inspect.error)
})

test('market data package rejects plain sqlite file', async () => {
  const dbPath = join(dataDir, 'plain.db')
  const store = new MarketDataStore(dbPath)
  await exportMarketDataPackage(store).then(buf => writeFile(join(dataDir, 'tmp.opmd'), buf))
  store.close()

  const raw = await readFile(dbPath)
  const inspect = inspectMarketDataPackage(raw)
  assert.equal(inspect.valid, false)
})

test('supplement jp pack export and merge preserves regional instruments', async () => {
  const {
    exportMarketDataPackSupplement,
    mergeMarketDataPackSupplement,
  } = await import('../packages/market-data/dist/package-pack.js')

  const sourcePath = join(dataDir, 'market-jp-source.db')
  const targetPath = join(dataDir, 'market-jp-target.db')
  const source = new MarketDataStore(sourcePath)
  source.upsertInstrument({
    code: '7203',
    market: 'JP',
    assetClass: 'EQUITY',
    name: 'Toyota',
  })
  source.upsertStock({
    code: '600519',
    name: '贵州茅台',
    market: 'SH',
    industry: '白酒',
    is_st: false,
    status: 'active',
  })

  const pack = await exportMarketDataPackSupplement(source, 'jp')
  source.close()

  const inspect = inspectMarketDataPackage(pack)
  assert.equal(inspect.valid, true)
  assert.equal(inspect.metadata?.kind, 'market_pack_supplement')
  assert.equal(inspect.metadata?.pack_scope, 'jp')
  assert.equal(inspect.metadata?.snapshot.jp_count, 1)
  assert.equal(inspect.metadata?.snapshot.stock_count, 0)

  const target = new MarketDataStore(targetPath)
  target.upsertStock({
    code: '600519',
    name: '贵州茅台',
    market: 'SH',
    industry: '白酒',
    is_st: false,
    status: 'active',
  })
  target.close()

  process.env.OPPTRIX_MARKET_DB_PATH = targetPath
  mergeMarketDataPackSupplement(pack, { dbPath: targetPath })

  const reopened = new MarketDataStore(targetPath)
  const cn = reopened.db.prepare(`SELECT code FROM stocks WHERE code = ?`).get('600519')
  assert.ok(cn)
  const jp = reopened.db.prepare(`
    SELECT code FROM instruments WHERE market = 'JP' AND code = ?
  `).get('7203')
  assert.ok(jp)
  reopened.close()
})
