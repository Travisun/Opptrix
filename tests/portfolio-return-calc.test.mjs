import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  calcPortfolioTradeFees,
  DEFAULT_PORTFOLIO_GLOBAL_FEES,
  legacyFlatFeesToGlobal,
  portfolioHoldingsStorageKey,
} from '@opptrix/shared'
import {
  dayChangeReturnPct,
  followReturnPct,
  holdingReturnPctFromQuote,
  watchlistDisplayReturnPct,
  isSanePortfolioReturnPct,
  sanitizePortfolioReturnPct,
  calcHoldingPnlFromTrades,
} from '@opptrix/shared'

test('portfolioHoldingsStorageKey aligns with Opptrix ledger code', () => {
  assert.equal(
    portfolioHoldingsStorageKey({ market: 'US', assetClass: 'EQUITY', symbol: 'aapl' }),
    'US:STOCK:AAPL.US',
  )
  assert.equal(
    portfolioHoldingsStorageKey({ market: 'CN', assetClass: 'EQUITY', symbol: '600519', exchange: 'SH' }),
    'CN:STOCK:600519.SH',
  )
  assert.equal(
    portfolioHoldingsStorageKey({ market: 'HK', assetClass: 'EQUITY', symbol: '700' }),
    'HK:STOCK:00700.HK',
  )
})

test('portfolioHoldingsStorageKey — CN FUND vs EQUITY same code must not collide', () => {
  const fund = { market: 'CN', assetClass: 'FUND', symbol: '009049', exchange: 'PF' }
  const equity = { market: 'CN', assetClass: 'EQUITY', symbol: '009049', exchange: 'SZ' }
  assert.equal(portfolioHoldingsStorageKey(fund), 'CN:OTC:009049.OF')
  assert.equal(portfolioHoldingsStorageKey(equity), 'CN:STOCK:009049.SZ')
  assert.notEqual(portfolioHoldingsStorageKey(fund), portfolioHoldingsStorageKey(equity))
})

test('portfolioHoldingsStorageKey — CN ETF Opptrix', () => {
  assert.equal(
    portfolioHoldingsStorageKey({ market: 'CN', assetClass: 'ETF', symbol: '510300', exchange: 'SH' }),
    'CN:ETF:510300.SH',
  )
})

test('US exchange trades skip CN stamp duty and transfer fee', () => {
  const global = legacyFlatFeesToGlobal({
    commissionRate: 0.00025,
    commissionMin: 5,
    stampDutyRate: 0.0005,
    transferFeeRate: 0.00001,
  })
  const sell = calcPortfolioTradeFees({
    ledgerKind: 'exchange',
    side: 'sell',
    amount: 10000,
    globalFees: global,
    market: 'US',
  })
  assert.equal(sell.stampDuty, 0)
  assert.equal(sell.transferFee, 0)
  assert.equal(sell.commission, 5)
})

test('CN exchange sell still applies stamp duty', () => {
  const global = legacyFlatFeesToGlobal({
    commissionRate: 0.00025,
    commissionMin: 5,
    stampDutyRate: 0.0005,
    transferFeeRate: 0.00001,
  })
  const sell = calcPortfolioTradeFees({
    ledgerKind: 'exchange',
    side: 'sell',
    amount: 10000,
    globalFees: global,
    market: 'CN',
  })
  assert.equal(sell.stampDuty, 5)
})

test('followReturnPct rejects absurd added price ratios', () => {
  assert.equal(followReturnPct(4, 250), null)
  assert.equal(followReturnPct(4, 4.02), -0.5)
})

test('dayChangeReturnPct recalculates when upstream change_pct is insane', () => {
  const pct = dayChangeReturnPct(94196, 4.0, 4.02)
  assert.ok(pct != null && Math.abs(pct) < 10)
})

test('holdingReturnPctFromQuote uses total pnl including realized', () => {
  const pct = holdingReturnPctFromQuote({
    shares: 100,
    totalCost: 1000,
    realizedPnl: 50,
  }, 11)
  assert.equal(pct, 15)
})

test('watchlistDisplayReturnPct prefers day change when follow diverges from holding-less row', () => {
  const pct = watchlistDisplayReturnPct({
    isHolding: false,
    addedPrice: 9.8,
    price: 4.0,
    changePct: -0.5,
    preClose: 4.02,
  })
  assert.equal(pct, -0.5)
})

test('sanitizePortfolioReturnPct drops insane values', () => {
  assert.equal(sanitizePortfolioReturnPct(94196), null)
  assert.equal(sanitizePortfolioReturnPct(12.5), 12.5)
})

test('isSanePortfolioReturnPct bounds absolute return', () => {
  assert.equal(isSanePortfolioReturnPct(499), true)
  assert.equal(isSanePortfolioReturnPct(501), false)
})

test('calcHoldingPnlFromTrades matches weighted-cost golden case (buy only)', () => {
  const r = calcHoldingPnlFromTrades([
    {
      id: 1,
      tradeSide: 'buy',
      shares: 100,
      price: 10,
      amount: 1000,
      totalFee: 5,
      tradeDate: '2024-01-02',
    },
  ], 12)
  assert.equal(r.shares, 100)
  assert.equal(r.totalCost, 1005)
  assert.equal(r.unrealizedPnl, 195)
  assert.equal(r.realizedPnl, 0)
  assert.equal(r.totalPnl, 195)
  assert.equal(r.totalPnlPct, 19.4)
})

test('calcHoldingPnlFromTrades matches weighted-cost golden case (partial sell)', () => {
  const r = calcHoldingPnlFromTrades([
    {
      id: 1,
      tradeSide: 'buy',
      shares: 100,
      price: 10,
      amount: 1000,
      totalFee: 5,
      tradeDate: '2024-01-02',
    },
    {
      id: 2,
      tradeSide: 'sell',
      shares: 50,
      price: 15,
      amount: 750,
      totalFee: 5,
      tradeDate: '2024-02-01',
    },
  ], 12)
  assert.equal(r.shares, 50)
  assert.equal(r.totalCost, 502.5)
  assert.equal(r.realizedPnl, 242.5)
  assert.equal(r.unrealizedPnl, 97.5)
  assert.equal(r.totalPnl, 340)
  assert.equal(r.totalPnlPct, 67.66)
})
