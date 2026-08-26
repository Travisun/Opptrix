import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

describe('portfolio store getTrades', () => {
  /** @type {string} */
  let tmpDir
  /** @type {typeof import('../packages/a-stock-layer/dist/portfolio/store.js').PortfolioStore} */
  let PortfolioStore
  /** @type {typeof import('../packages/user-store/dist/index.js').getUserDataStore} */
  let getUserDataStore

  before(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opptrix-portfolio-trades-'))
    process.env.OPPTRIX_DATA_DIR = tmpDir
    ;({ getUserDataStore } = await import('../packages/user-store/dist/index.js'))
    getUserDataStore().close()
    ;({ PortfolioStore } = await import('../packages/a-stock-layer/dist/portfolio/store.js'))
    PortfolioStore.resetForTests()
  })

  after(() => {
    try {
      PortfolioStore.resetForTests()
    } catch { /* ignore */ }
    try {
      getUserDataStore().close()
    } catch { /* ignore */ }
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('getTrades without code returns all rows (no 500 truncation)', () => {
    const store = PortfolioStore.getInstance()
    store.clearAll()
    const n = 520
    for (let i = 0; i < n; i++) {
      const day = String((i % 28) + 1).padStart(2, '0')
      store.addTrade({
        code: '600519',
        market: 'CN',
        name: '贵州茅台',
        tradeSide: 'buy',
        shares: 1,
        price: 10,
        amount: 10,
        commission: 0,
        stampDuty: 0,
        transferFee: 0,
        totalFee: 0,
        tradeDate: `2020-01-${day}`,
      })
    }
    const all = store.getTrades()
    assert.equal(all.length, n)
    store.clearAll()
  })

  it('getTrades matches FUND namespace to legacy bare six-digit rows', () => {
    const store = PortfolioStore.getInstance()
    store.clearAll()
    store.addTrade({
      code: '009049',
      market: 'CN',
      name: '测试基金',
      tradeSide: 'buy',
      shares: 100,
      price: 1.2,
      amount: 120,
      commission: 0,
      stampDuty: 0,
      transferFee: 0,
      totalFee: 0,
      tradeDate: '2024-06-01',
    })
    const byPf = store.getTrades('CN:PF.009049', 'CN')
    assert.equal(byPf.length, 1)
    assert.equal(byPf[0]?.code, '009049')
    const byBare = store.getTrades('009049', 'CN')
    assert.equal(byBare.length, 1)
    store.clearAll()
  })
})
