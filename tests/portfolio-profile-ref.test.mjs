import assert from 'node:assert/strict'
import test from 'node:test'
import { resolvePortfolioProfile } from '../packages/shared/dist/portfolio-profile.js'
import {
  portfolioInstrumentRef,
  portfolioLedgerKey,
} from '../packages/a-stock-layer/dist/portfolio/instrument.js'
import { PortfolioManager } from '../packages/a-stock-layer/dist/portfolio/manager.js'
import { PortfolioStore } from '../packages/a-stock-layer/dist/portfolio/store.js'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

test('resolvePortfolioProfile — INDEX/CRYPTO supportsPnl false; FUND markCapability fund_quote', () => {
  const equity = resolvePortfolioProfile(portfolioInstrumentRef('600519', 'CN'))
  assert.equal(equity.supportsPnl, true)
  assert.equal(equity.markCapability, 'realtime')

  const fund = resolvePortfolioProfile(portfolioInstrumentRef('009049', 'CN', 'FUND'))
  assert.equal(fund.supportsPnl, true)
  assert.equal(fund.markCapability, 'fund_quote')

  const idx = resolvePortfolioProfile({ market: 'CN', assetClass: 'INDEX', symbol: '000001', exchange: 'SH' })
  assert.equal(idx.supportsPnl, false)

  const crypto = resolvePortfolioProfile({
    market: 'CRYPTO',
    assetClass: 'CRYPTO_SPOT',
    symbol: 'BTC',
    quote: 'USDT',
  })
  assert.equal(crypto.supportsPnl, false)
})

test('PortfolioManager buy FUND persists assetClass + Opptrix OTC code; mark uses fund_quote', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'opptrix-pf-'))
  process.env.OPPTRIX_DATA_DIR = tmp
  const { getUserDataStore } = await import('../packages/user-store/dist/index.js')
  getUserDataStore().close?.()
  PortfolioStore.resetForTests?.()

  const calls = []
  const engine = {
    async queryInstrumentData(ref, cap) {
      calls.push({ ref, cap })
      return {
        data: [{ name: '测试基金', price: 1.25, unitNav: 1.25 }],
      }
    },
  }
  const pm = new PortfolioManager(engine)
  const bought = await pm.buy('009049', 1000, 1.2, '2024-06-01', '', 'CN', 'FUND')
  assert.equal(bought.assetClass, 'FUND')
  assert.equal(bought.code, 'CN:OTC:009049.OF')
  assert.equal(portfolioLedgerKey(bought.code, bought.market, bought.assetClass), 'CN:PF.009049')

  const holdings = await pm.holdings(true)
  assert.equal(holdings.length, 1)
  assert.equal(holdings[0].assetClass, 'FUND')
  assert.equal(holdings[0].code, 'CN:OTC:009049.OF')
  assert.ok(holdings[0].instrument)
  assert.equal(holdings[0].currentPrice, 1.25)
  assert.ok(calls.some(c => c.cap === 'fund_quote'))
  assert.ok(calls.every(c => c.ref.assetClass === 'FUND'))

  pm.clear()
  PortfolioStore.resetForTests?.()
  try { getUserDataStore().close?.() } catch { /* ignore */ }
  fs.rmSync(tmp, { recursive: true, force: true })
})

test('PortfolioManager holdings use watchlist name and Opptrix code', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'opptrix-pf-wl-name-'))
  process.env.OPPTRIX_DATA_DIR = tmp
  const { getUserDataStore } = await import('../packages/user-store/dist/index.js')
  getUserDataStore().close?.()
  PortfolioStore.resetForTests?.()
  const { WatchlistStore } = await import('../packages/a-stock-layer/dist/watchlist/store.js')

  WatchlistStore.resetForTests?.()
  WatchlistStore.getInstance().replace([{
    code: 'US:STOCK:NVDA.US',
    name: '英伟达',
    instrument: { market: 'US', assetClass: 'EQUITY', symbol: 'NVDA' },
  }])

  const pm = new PortfolioManager()
  const store = PortfolioStore.getInstance()
  store.addTrade({
    code: 'US:STOCK:NVDA.US',
    market: 'US',
    assetClass: 'EQUITY',
    instrument: { market: 'US', assetClass: 'EQUITY', symbol: 'NVDA' },
    name: '',
    tradeSide: 'buy',
    shares: 10,
    price: 200,
    amount: 2000,
    commission: 0,
    stampDuty: 0,
    transferFee: 0,
    totalFee: 0,
    tradeDate: '2024-06-01',
  })

  const holdings = await pm.holdings(false)
  assert.equal(holdings.length, 1)
  assert.equal(holdings[0].name, '英伟达')
  assert.equal(holdings[0].code, 'US:STOCK:NVDA.US')

  pm.clear()
  WatchlistStore.resetForTests?.()
  PortfolioStore.resetForTests?.()
  try { getUserDataStore().close?.() } catch { /* ignore */ }
  fs.rmSync(tmp, { recursive: true, force: true })
})

test('PortfolioManager holdings/summary skip INDEX (!supportsPnl)', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'opptrix-pf-idx-'))
  process.env.OPPTRIX_DATA_DIR = tmp
  const { getUserDataStore } = await import('../packages/user-store/dist/index.js')
  getUserDataStore().close?.()
  PortfolioStore.resetForTests?.()

  const pm = new PortfolioManager()
  await pm.buy('600519', 100, 1800, '2024-01-01', '贵州茅台', 'CN', 'EQUITY')
  await pm.recordTrade('buy', 'CN:INDEX:000001', 1, 3000, {
    date: '2024-01-01',
    name: '上证指数',
    market: 'CN',
    assetClass: 'INDEX',
  })

  const holdings = await pm.holdings(false)
  assert.equal(holdings.length, 1)
  assert.equal(holdings[0]?.assetClass, 'EQUITY')

  const summary = await pm.summary(false)
  assert.equal(summary.holdingsCount, 1)
  assert.equal(summary.holdings.length, 1)
  assert.ok(summary.totalMarketValue > 0)
  // INDEX 成交仍在账本，但不进汇总
  assert.ok(summary.tradesCount >= 2)

  pm.clear()
  PortfolioStore.resetForTests?.()
  try { getUserDataStore().close?.() } catch { /* ignore */ }
  fs.rmSync(tmp, { recursive: true, force: true })
})
