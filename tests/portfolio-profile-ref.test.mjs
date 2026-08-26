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

test('PortfolioManager buy FUND persists assetClass + CN:PF code; mark uses fund_quote', async () => {
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
  assert.equal(bought.code, 'CN:PF.009049')
  assert.equal(portfolioLedgerKey(bought.code, bought.market, bought.assetClass), 'CN:PF.009049')

  const holdings = await pm.holdings(true)
  assert.equal(holdings.length, 1)
  assert.equal(holdings[0].assetClass, 'FUND')
  assert.equal(holdings[0].currentPrice, 1.25)
  assert.ok(calls.some(c => c.cap === 'fund_quote'))
  assert.ok(calls.every(c => c.ref.assetClass === 'FUND'))

  pm.clear()
  PortfolioStore.resetForTests?.()
  try { getUserDataStore().close?.() } catch { /* ignore */ }
  fs.rmSync(tmp, { recursive: true, force: true })
})
