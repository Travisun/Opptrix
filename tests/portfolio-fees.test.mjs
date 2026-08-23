import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  calcPortfolioTradeFees,
  DEFAULT_PORTFOLIO_GLOBAL_FEES,
  estimatePortfolioTradeFees,
  legacyFlatFeesToGlobal,
  resolvePortfolioLedgerKind,
} from '@opptrix/shared'

test('resolvePortfolioLedgerKind distinguishes listed fund vs otc', () => {
  assert.equal(
    resolvePortfolioLedgerKind({ market: 'CN', assetClass: 'ETF', symbol: '510300' }),
    'exchange',
  )
  assert.equal(
    resolvePortfolioLedgerKind({ market: 'CN', assetClass: 'FUND', symbol: '510300', exchange: 'PF' }),
    'exchange',
  )
  assert.equal(
    resolvePortfolioLedgerKind({ market: 'CN', assetClass: 'FUND', symbol: '000001', exchange: 'OF' }),
    'otc_fund',
  )
})

test('exchange fees use commission min_rate and sell stamp duty', () => {
  const global = legacyFlatFeesToGlobal({
    commissionRate: 0.00025,
    commissionMin: 5,
    stampDutyRate: 0.0005,
    transferFeeRate: 0.00001,
  })
  const buy = calcPortfolioTradeFees({
    ledgerKind: 'exchange',
    side: 'buy',
    amount: 1000,
    globalFees: global,
  })
  assert.equal(buy.commission, 5)
  assert.equal(buy.stampDuty, 0)
  assert.equal(buy.transferFee, 0.01)

  const sell = calcPortfolioTradeFees({
    ledgerKind: 'exchange',
    side: 'sell',
    amount: 10000,
    globalFees: global,
  })
  assert.equal(sell.commission, 5)
  assert.equal(sell.stampDuty, 5)
})

test('otc fund defaults to zero fees', () => {
  const fees = calcPortfolioTradeFees({
    ledgerKind: 'otc_fund',
    side: 'buy',
    amount: 5000,
    globalFees: DEFAULT_PORTFOLIO_GLOBAL_FEES,
  })
  assert.equal(fees.totalFee, 0)
})

test('instrument override fixed commission', () => {
  const fees = estimatePortfolioTradeFees(
    { market: 'CN', assetClass: 'EQUITY', symbol: '600519' },
    'buy',
    100,
    10,
    DEFAULT_PORTFOLIO_GLOBAL_FEES,
    {
      commission: { mode: 'fixed', fixed: 1.5 },
      transferFee: { mode: 'none' },
    },
  )
  assert.equal(fees.commission, 1.5)
  assert.equal(fees.totalFee, 1.5)
})

test('otc subscription rate override', () => {
  const fees = estimatePortfolioTradeFees(
    { market: 'CN', assetClass: 'FUND', symbol: '000001', exchange: 'OF' },
    'buy',
    1000,
    1,
    DEFAULT_PORTFOLIO_GLOBAL_FEES,
    { subscriptionFee: { mode: 'rate', rate: 0.0015 } },
  )
  assert.equal(fees.commission, 1.5)
  assert.equal(fees.totalFee, 1.5)
})

test('recompute trade fees updates stored zero fees', () => {
  const global = legacyFlatFeesToGlobal({
    commissionRate: 0.00025,
    commissionMin: 5,
    stampDutyRate: 0.0005,
    transferFeeRate: 0.00001,
  })
  const fees = calcPortfolioTradeFees({
    ledgerKind: 'exchange',
    side: 'buy',
    amount: 1000,
    globalFees: global,
  })
  assert.equal(fees.commission, 5)
  assert.equal(fees.totalFee, 5.01)
})
