import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  calcPortfolioTradeFees,
  DEFAULT_PORTFOLIO_GLOBAL_FEES,
  legacyFlatFeesToGlobal,
  portfolioHoldingsStorageKey,
} from '@opptrix/shared'

test('portfolioHoldingsStorageKey aligns watchlist namespace with ledger code', () => {
  assert.equal(
    portfolioHoldingsStorageKey({ market: 'US', assetClass: 'EQUITY', symbol: 'aapl' }),
    'AAPL',
  )
  assert.equal(
    portfolioHoldingsStorageKey({ market: 'CN', assetClass: 'EQUITY', symbol: '600519', exchange: 'SH' }),
    '600519',
  )
  assert.equal(
    portfolioHoldingsStorageKey({ market: 'HK', assetClass: 'EQUITY', symbol: '700' }),
    '00700',
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
