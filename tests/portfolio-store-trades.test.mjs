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

  it('deleteTradesForCode clears Opptrix + bare aliases; keeps FUND≠EQUITY isolation', () => {
    const store = PortfolioStore.getInstance()
    store.clearAll()
    store.addTrade({
      code: '600519',
      market: 'CN',
      assetClass: 'EQUITY',
      name: '贵州茅台',
      tradeSide: 'buy',
      shares: 100,
      price: 1800,
      amount: 180000,
      commission: 0,
      stampDuty: 0,
      transferFee: 0,
      totalFee: 0,
      tradeDate: '2024-01-01',
    })
    store.addTrade({
      code: 'CN:EQUITY:600519',
      market: 'CN',
      assetClass: 'EQUITY',
      name: '贵州茅台',
      tradeSide: 'buy',
      shares: 10,
      price: 1800,
      amount: 18000,
      commission: 0,
      stampDuty: 0,
      transferFee: 0,
      totalFee: 0,
      tradeDate: '2024-01-02',
    })
    store.addTrade({
      code: '009049',
      market: 'CN',
      assetClass: 'FUND',
      name: '测试基金',
      tradeSide: 'buy',
      shares: 1000,
      price: 1.2,
      amount: 1200,
      commission: 0,
      stampDuty: 0,
      transferFee: 0,
      totalFee: 0,
      tradeDate: '2024-01-03',
    })
    store.setInstrumentFees('600519', 'CN', { commissionRate: 0.0001 }, 'EQUITY')

    const removed = store.deleteTradesForCode('CN:EQUITY:600519', 'CN', 'EQUITY')
    assert.equal(removed, 2)
    const left = store.getTrades()
    assert.equal(left.length, 1)
    assert.equal(left[0]?.assetClass, 'FUND')
    assert.equal(Object.keys(store.getInstrumentFees('600519', 'CN', 'EQUITY')).length, 0)
    store.clearAll()
  })

  it('deleteTradesForCode INDEX bare alias does not wipe EQUITY same symbol', () => {
    const store = PortfolioStore.getInstance()
    store.clearAll()
    store.addTrade({
      code: '000001',
      market: 'CN',
      assetClass: 'EQUITY',
      name: '平安银行',
      tradeSide: 'buy',
      shares: 100,
      price: 10,
      amount: 1000,
      commission: 0,
      stampDuty: 0,
      transferFee: 0,
      totalFee: 0,
      tradeDate: '2024-01-01',
    })
    store.addTrade({
      code: 'CN:INDEX:000001',
      market: 'CN',
      assetClass: 'INDEX',
      name: '上证指数',
      tradeSide: 'buy',
      shares: 1,
      price: 3000,
      amount: 3000,
      commission: 0,
      stampDuty: 0,
      transferFee: 0,
      totalFee: 0,
      tradeDate: '2024-01-01',
    })
    const removed = store.deleteTradesForCode('CN:INDEX:000001', 'CN', 'INDEX')
    assert.equal(removed, 1)
    const left = store.getTrades()
    assert.equal(left.length, 1)
    assert.equal(left[0]?.assetClass, 'EQUITY')
    store.clearAll()
  })

  it('startup purge removes trades not in current watchlist (once)', async () => {
    const { DEFAULT_PORTFOLIO_GLOBAL_FEES } = await import('@opptrix/shared/portfolio-fees')
    PortfolioStore.resetForTests()
    const us = getUserDataStore()
    us.setDocument('watchlist', 'default', {
      items: [{
        code: 'CN:STOCK:600519.SH',
        name: '贵州茅台',
        instrument: { market: 'CN', assetClass: 'EQUITY', symbol: '600519', exchange: 'SH' },
      }],
    })
    us.setDocument('portfolio', 'default', {
      globalFees: DEFAULT_PORTFOLIO_GLOBAL_FEES,
      instrumentFees: {},
      trades: [
        {
          id: 1,
          code: 'CN:STOCK:600519.SH',
          market: 'CN',
          assetClass: 'EQUITY',
          name: '贵州茅台',
          tradeSide: 'buy',
          shares: 100,
          price: 1800,
          amount: 180000,
          commission: 0,
          stampDuty: 0,
          transferFee: 0,
          totalFee: 0,
          tradeDate: '2024-01-01',
        },
        {
          id: 2,
          code: 'CN:STOCK:603738.SH',
          market: 'CN',
          assetClass: 'EQUITY',
          name: '泰晶科技',
          tradeSide: 'buy',
          shares: 200,
          price: 20,
          amount: 4000,
          commission: 0,
          stampDuty: 0,
          transferFee: 0,
          totalFee: 0,
          tradeDate: '2024-01-02',
        },
      ],
      nextId: 3,
    })
    const store = PortfolioStore.getInstance()
    const left = store.getTrades()
    assert.equal(left.length, 1)
    assert.match(left[0]?.code ?? '', /600519/)
    PortfolioStore.resetForTests()
    const store2 = PortfolioStore.getInstance()
    assert.equal(store2.getTrades().length, 1)
    store2.clearAll()
  })

  it('startup upgrades skip after meta flags — no re-scan on second load', async () => {
    const { DEFAULT_PORTFOLIO_GLOBAL_FEES } = await import('@opptrix/shared/portfolio-fees')
    const {
      INSTRUMENT_ID_UNIFY_PORTFOLIO_V1,
      PORTFOLIO_PURGE_WATCHLIST_ORPHANS_V1,
    } = await import('../packages/a-stock-layer/dist/portfolio/store.js')
    const us = getUserDataStore()
    PortfolioStore.resetForTests()
    us.setDocument('portfolio', 'default', {
      globalFees: DEFAULT_PORTFOLIO_GLOBAL_FEES,
      instrumentFees: {},
      trades: [],
      nextId: 1,
    })
    us.setMetaFlag('portfolio_fee_market_aware_v1')
    us.setMetaFlag(INSTRUMENT_ID_UNIFY_PORTFOLIO_V1)
    us.setMetaFlag(PORTFOLIO_PURGE_WATCHLIST_ORPHANS_V1)
    us.setDocument('watchlist', 'default', { items: [{ code: 'CN:STOCK:600519.SH', name: '贵州茅台' }] })

    const store = PortfolioStore.getInstance()
    assert.equal(store.getTrades().length, 0)
    PortfolioStore.resetForTests()
    const store2 = PortfolioStore.getInstance()
    assert.equal(store2.getTrades().length, 0)
    store2.clearAll()
  })
})
