/**
 * 关注列表 — OpptrixQuant ID 持久化（save/load/replace 不回落命名空间）
 */
import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const REIT_ITEM = {
  code: 'CN:REIT:180101.SZ',
  name: '博时蛇口产园REIT',
  industry: 'A股 · 深交所',
  instrument: {
    market: 'CN',
    assetClass: 'REIT',
    symbol: '180101',
    exchange: 'SZ',
  },
}

describe('watchlist Opptrix ID persistence', () => {
  /** @type {string} */
  let tmpDir
  /** @type {typeof import('../packages/a-stock-layer/dist/index.js').WatchlistStore} */
  let WatchlistStore
  /** @type {typeof import('../packages/a-stock-layer/dist/watchlist/instrument.js').normalizeWatchlistItem} */
  let normalizeWatchlistItem
  /** @type {typeof import('../packages/user-store/dist/index.js').getUserDataStore} */
  let getUserDataStore

  before(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opptrix-watchlist-opptrix-id-'))
    process.env.OPPTRIX_DATA_DIR = tmpDir
    ;({ getUserDataStore } = await import('../packages/user-store/dist/index.js'))
    getUserDataStore().close()
    const layer = await import('../packages/a-stock-layer/dist/index.js')
    ;({ WatchlistStore, normalizeWatchlistItem } = layer)
    WatchlistStore.resetForTests()
  })

  after(() => {
    try {
      WatchlistStore.resetForTests()
    } catch { /* ignore */ }
    try {
      getUserDataStore().close()
    } catch { /* ignore */ }
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('normalizeWatchlistItem preserves CN:REIT Opptrix ID', () => {
    const row = normalizeWatchlistItem(REIT_ITEM)
    assert.equal(row.code, 'CN:REIT:180101.SZ')
    assert.equal(row.instrument?.assetClass, 'REIT')
  })

  it('replace + flush + reload keeps Opptrix ID on disk', () => {
    const uds = getUserDataStore()
    const store = WatchlistStore.getInstance()
    store.replace([REIT_ITEM])
    store.flush()

    const disk = uds.getDocument('watchlist', 'default')
    assert.equal(disk?.items?.[0]?.code, 'CN:REIT:180101.SZ')

    WatchlistStore.resetForTests()
    const reloaded = WatchlistStore.getInstance().list()
    assert.equal(reloaded.length, 1)
    assert.equal(reloaded[0]?.code, 'CN:REIT:180101.SZ')
    assert.equal(reloaded[0]?.instrument?.assetClass, 'REIT')
  })

  it('legacy CN:SZ namespace items unchanged', () => {
    const legacy = normalizeWatchlistItem({
      code: 'CN:SZ.600519',
      name: '贵州茅台',
      instrument: { market: 'CN', assetClass: 'EQUITY', symbol: '600519', exchange: 'SH' },
    })
    assert.equal(legacy.code, 'CN:SH.600519')
  })
})
