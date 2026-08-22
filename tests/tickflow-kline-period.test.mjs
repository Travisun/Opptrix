import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveTickflowKlineQuery, BROKER_CHART_PERIOD_TO_TICKFLOW } from '../packages/a-stock-layer/dist/providers/tickflow/normalize/klines.js'
import {
  resolveCrossMarketKlineEngineQuery,
  crossMarketFiveDayMinuteCount,
} from '../packages/a-stock-layer/dist/utils/cross-market-kline.js'

test('resolveTickflowKlineQuery maps intraday to klines period 1m', () => {
  const q = resolveTickflowKlineQuery('intraday', 100)
  assert.ok(q)
  assert.equal(q.tfPeriod, '1m')
  assert.equal(q.count, 400)
})

test('resolveTickflowKlineQuery maps 5day to klines period 1m', () => {
  const q = resolveTickflowKlineQuery('5day', 5)
  assert.ok(q)
  assert.equal(q.tfPeriod, '1m')
  assert.equal(q.count, 2000)
})

test('resolveTickflowKlineQuery maps year periods to daily bars', () => {
  const y1 = resolveTickflowKlineQuery('year1', 10)
  assert.ok(y1)
  assert.equal(y1.tfPeriod, '1d')
  assert.equal(y1.count, 260)

  const y3 = resolveTickflowKlineQuery('year3', 10)
  assert.ok(y3)
  assert.equal(y3.count, 780)

  const y5 = resolveTickflowKlineQuery('year5', 10)
  assert.ok(y5)
  assert.equal(y5.count, 1300)
})

test('BROKER_CHART_PERIOD_TO_TICKFLOW aligns UI with TickFlow klines period', () => {
  for (const [ui, tf] of Object.entries(BROKER_CHART_PERIOD_TO_TICKFLOW)) {
    const q = resolveTickflowKlineQuery(ui, 60)
    assert.ok(q, ui)
    assert.equal(q.tfPeriod, tf, `${ui} → ${tf}`)
    assert.equal(q.count, 60)
  }
})

test('resolveTickflowKlineQuery keeps weekly/monthly/quarterly/yearly', () => {
  assert.equal(resolveTickflowKlineQuery('weekly', 120)?.tfPeriod, '1w')
  assert.equal(resolveTickflowKlineQuery('monthly', 80)?.tfPeriod, '1M')
  assert.equal(resolveTickflowKlineQuery('quarterly', 40)?.tfPeriod, '1Q')
  assert.equal(resolveTickflowKlineQuery('yearly', 20)?.tfPeriod, '1Y')
  assert.equal(resolveTickflowKlineQuery('daily', 60)?.tfPeriod, '1d')
})

test('resolveCrossMarketKlineEngineQuery aligns UI periods', () => {
  const intraday = resolveCrossMarketKlineEngineQuery('intraday', 50)
  assert.equal(intraday.enginePeriod, 'intraday')
  assert.equal(intraday.intradayLine, true)

  const five = resolveCrossMarketKlineEngineQuery('5day', 5)
  assert.equal(five.enginePeriod, '5day')
  assert.equal(five.count, crossMarketFiveDayMinuteCount(5))
  assert.equal(five.intradayLine, true)

  const quarterly = resolveCrossMarketKlineEngineQuery('quarterly', 40)
  assert.equal(quarterly.enginePeriod, 'quarterly')
  assert.equal(quarterly.count, 40)
  assert.equal(quarterly.intradayLine, false)

  const yearly = resolveCrossMarketKlineEngineQuery('yearly', 20)
  assert.equal(yearly.enginePeriod, 'yearly')
  assert.equal(yearly.count, 20)
  assert.equal(yearly.intradayLine, false)
})
