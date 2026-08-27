import assert from 'node:assert/strict'
import test from 'node:test'
import {
  formatFeeRatePercentInput,
  parseFeeAmountInput,
  parseFeeRatePercentInput,
} from '../client-ui/src/market/portfolioFeeInput.ts'
import { calcPortfolioTradeFees, DEFAULT_PORTFOLIO_GLOBAL_FEES } from '@opptrix/shared'

test('parseFeeRatePercentInput — 百分比与存储 rate 对齐', () => {
  assert.equal(parseFeeRatePercentInput('0.025'), 0.00025)
  assert.equal(parseFeeRatePercentInput('0.025'), 0.00025)
  assert.equal(parseFeeRatePercentInput('0.'), null)
  assert.equal(parseFeeRatePercentInput(''), null)
  assert.equal(formatFeeRatePercentInput(0.00025), '0.025')
})

test('parseFeeRatePercentInput — 与 calcPortfolioTradeFees 一致', () => {
  const global = structuredClone(DEFAULT_PORTFOLIO_GLOBAL_FEES)
  const rate = parseFeeRatePercentInput('0.025')
  assert.equal(rate, 0.00025)
  global.cn.commission = { mode: 'rate', rate: rate ?? 0 }
  const fees = calcPortfolioTradeFees({
    ledgerKind: 'exchange',
    side: 'buy',
    amount: 10000,
    globalFees: global,
    market: 'CN',
  })
  assert.equal(fees.commission, 2.5)
})

test('parseFeeAmountInput — 最低费小数', () => {
  assert.equal(parseFeeAmountInput('5'), 5)
  assert.equal(parseFeeAmountInput('0.99'), 0.99)
  assert.equal(parseFeeAmountInput('5.'), null)
})
