/**
 * AC：portfolio instrument_id_unify 幂等迁移 + 新买入 Opptrix code
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

test('portfolio migrate instrument_id_unify_portfolio_v1 — bare → Opptrix; idempotent', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'opptrix-pf-migrate-'))
  process.env.OPPTRIX_DATA_DIR = tmp

  const { getUserDataStore } = await import('../packages/user-store/dist/index.js')
  try { getUserDataStore().close() } catch { /* */ }

  const storeApi = getUserDataStore()
  storeApi.setDocument('portfolio', 'default', {
    globalFees: {
      exchange: {
        commission: { mode: 'min_rate', rate: 0.00025, min: 5 },
        stampDuty: { mode: 'rate', rate: 0.0005 },
        transferFee: { mode: 'rate', rate: 0.00001 },
      },
      otcFund: {
        subscriptionFee: { mode: 'none' },
        redemptionFee: { mode: 'none' },
      },
    },
    instrumentFees: {
      '600519': { commission: { mode: 'fixed', fixed: 1 } },
      'CN:PF.009049': { subscriptionFee: { mode: 'rate', rate: 0.001 } },
    },
    trades: [
      {
        id: 1,
        code: '600519',
        market: 'CN',
        name: '贵州茅台',
        tradeSide: 'buy',
        shares: 100,
        price: 1800,
        amount: 180000,
        commission: 5,
        stampDuty: 0,
        transferFee: 0,
        totalFee: 5,
        tradeDate: '2024-01-02',
      },
      {
        id: 2,
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
      },
      {
        id: 3,
        code: 'AAPL',
        market: 'US',
        name: 'Apple',
        tradeSide: 'buy',
        shares: 10,
        price: 180,
        amount: 1800,
        commission: 0,
        stampDuty: 0,
        transferFee: 0,
        totalFee: 0,
        tradeDate: '2024-01-04',
      },
    ],
    nextId: 4,
  })

  const { PortfolioStore, INSTRUMENT_ID_UNIFY_PORTFOLIO_V1 } = await import(
    '../packages/a-stock-layer/dist/portfolio/store.js'
  )
  PortfolioStore.resetForTests()

  const first = PortfolioStore.getInstance()
  const trades1 = first.getTrades()
  assert.equal(trades1.length, 3)

  const equity = trades1.find(t => t.name === '贵州茅台')
  assert.equal(equity?.code, 'CN:STOCK:600519.SH')
  assert.equal(equity?.assetClass, 'EQUITY')
  assert.ok(equity?.instrument)

  const fund = trades1.find(t => t.name === '测试基金')
  assert.equal(fund?.code, 'CN:OTC:009049.OF')
  assert.equal(fund?.assetClass, 'FUND')
  assert.notEqual(fund?.code, equity?.code)

  const us = trades1.find(t => t.name === 'Apple')
  assert.equal(us?.code, 'US:STOCK:AAPL.US')
  assert.equal(us?.market, 'US')

  const feeEquity = first.getInstrumentFees('600519', 'CN')
  assert.equal(feeEquity.commission?.mode, 'fixed')
  const feeFund = first.getInstrumentFees('CN:PF.009049', 'CN', 'FUND')
  assert.equal(feeFund.subscriptionFee?.mode, 'rate')

  assert.equal(storeApi.getMetaFlag(INSTRUMENT_ID_UNIFY_PORTFOLIO_V1), true)

  PortfolioStore.resetForTests()
  const second = PortfolioStore.getInstance()
  const trades2 = second.getTrades()
  assert.deepEqual(
    trades2.map(t => ({ code: t.code, assetClass: t.assetClass })),
    trades1.map(t => ({ code: t.code, assetClass: t.assetClass })),
  )

  PortfolioStore.resetForTests()
  try { getUserDataStore().close() } catch { /* */ }
  fs.rmSync(tmp, { recursive: true, force: true })
})

test('new buy writes Opptrix code + assetClass + instrument', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'opptrix-pf-buy-'))
  process.env.OPPTRIX_DATA_DIR = tmp
  const { getUserDataStore } = await import('../packages/user-store/dist/index.js')
  try { getUserDataStore().close() } catch { /* */ }

  const { PortfolioStore } = await import('../packages/a-stock-layer/dist/portfolio/store.js')
  const { PortfolioManager } = await import('../packages/a-stock-layer/dist/portfolio/manager.js')
  PortfolioStore.resetForTests()

  const pm = new PortfolioManager()
  const bought = await pm.buy('603738', 100, 12.5, '2024-08-01', '上海港湾', 'CN', 'EQUITY')
  assert.equal(bought.code, 'CN:STOCK:603738.SH')
  assert.equal(bought.assetClass, 'EQUITY')
  assert.ok(bought.instrument)
  assert.equal(bought.instrument.symbol, '603738')

  const hk = await pm.buy('00700', 100, 380, '2024-08-01', '腾讯', 'HK', 'EQUITY')
  assert.equal(hk.code, 'HK:STOCK:00700.HK')

  const us = await pm.buy('AAPL', 10, 180, '2024-08-01', 'Apple', 'US', 'EQUITY')
  assert.equal(us.code, 'US:STOCK:AAPL.US')

  const fund = await pm.buy('009049', 1000, 1.2, '2024-08-01', '基金', 'CN', 'FUND')
  assert.equal(fund.code, 'CN:OTC:009049.OF')
  assert.equal(fund.assetClass, 'FUND')

  const holdings = await pm.holdings(false)
  const fundH = holdings.find(h => h.assetClass === 'FUND')
  const equitySameDigits = holdings.find(h => h.code.includes('603738'))
  assert.ok(fundH)
  assert.equal(fundH.code, 'CN:OTC:009049.OF')
  assert.ok(fundH.instrument)
  assert.ok(equitySameDigits)
  assert.notEqual(fundH.code, equitySameDigits.code)

  pm.clear()
  PortfolioStore.resetForTests()
  try { getUserDataStore().close() } catch { /* */ }
  fs.rmSync(tmp, { recursive: true, force: true })
})
