import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildFxRatesToCnyFromOpptrix,
  convertAmountToCny,
  holdingReturnPctInCny,
  marketQuoteCurrency,
  opptrixRmbRateToCnyPerUnit,
} from '../packages/shared/dist/fx-rates.js'

describe('fx-rates', () => {
  const rates = buildFxRatesToCnyFromOpptrix(
    [
      { base: 'USD', rate: 720 },
      { base: 'HKD', rate: 92 },
    ],
    { tradeDate: '2026-01-02', source: 'safe', updatedAt: '2026-01-01T00:00:00.000Z' },
  )

  it('opptrixRmbRateToCnyPerUnit divides per_100_foreign rate', () => {
    assert.equal(opptrixRmbRateToCnyPerUnit(720), 7.2)
    assert.equal(opptrixRmbRateToCnyPerUnit(92), 0.92)
  })

  it('buildFxRatesToCnyFromOpptrix maps full currency table', () => {
    assert.equal(rates.USD, 7.2)
    assert.equal(rates.HKD, 0.92)
    assert.equal(rates.byCurrency.CNY, 1)
    assert.equal(rates.tradeDate, '2026-01-02')
    assert.equal(rates.source, 'safe')
  })

  it('marketQuoteCurrency maps HK/US to foreign currency', () => {
    assert.equal(marketQuoteCurrency('HK'), 'HKD')
    assert.equal(marketQuoteCurrency('US'), 'USD')
    assert.equal(marketQuoteCurrency('CN'), 'CNY')
  })

  it('convertAmountToCny multiplies foreign amounts', () => {
    assert.equal(convertAmountToCny(100, 'USD', rates), 720)
    assert.equal(convertAmountToCny(100, 'CNY', rates), 100)
  })

  it('holdingReturnPctInCny matches local pct under single spot rate', () => {
    const holding = {
      shares: 100,
      totalCost: 10000,
      realizedPnl: 0,
      currentPrice: 110,
    }
    const local = holdingReturnPctInCny(holding, 110, 'US', null)
    const cny = holdingReturnPctInCny(holding, 110, 'US', rates)
    assert.equal(local, 10)
    assert.equal(cny, 10)
  })
})
