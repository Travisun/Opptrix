import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  dailyBarsNeededForCrossMarketPeriod,
  deriveCrossMarketKlinesFromDaily,
  filterKlinesByCalendarYears,
  resampleKlinesByTradingDays,
  resampleKlinesMonthly,
  resampleKlinesWeekly,
} from '../packages/a-stock-layer/dist/utils/kline-resample.js'

const daily = [
  { code: '00700', date: '2024-01-02', open: 10, high: 11, low: 9, close: 10.5, volume: 100, amount: 1000, changePct: 1, turnoverRate: null },
  { code: '00700', date: '2024-01-03', open: 10.5, high: 12, low: 10, close: 11, volume: 120, amount: 1200, changePct: 1, turnoverRate: null },
  { code: '00700', date: '2024-01-04', open: 11, high: 12, low: 10.5, close: 11.5, volume: 110, amount: 1100, changePct: 1, turnoverRate: null },
  { code: '00700', date: '2024-01-05', open: 11.5, high: 13, low: 11, close: 12, volume: 130, amount: 1300, changePct: 1, turnoverRate: null },
  { code: '00700', date: '2024-01-08', open: 12, high: 13, low: 11.5, close: 12.5, volume: 140, amount: 1400, changePct: 1, turnoverRate: null },
  { code: '00700', date: '2024-01-09', open: 12.5, high: 14, low: 12, close: 13, volume: 150, amount: 1500, changePct: 1, turnoverRate: null },
]

test('resampleKlinesByTradingDays aggregates every 5 trading days', () => {
  const out = resampleKlinesByTradingDays(daily.slice(0, 5), 5)
  assert.equal(out.length, 1)
  assert.equal(out[0]?.date, '2024-01-08')
  assert.equal(out[0]?.open, 10)
  assert.equal(out[0]?.close, 12.5)
  assert.equal(out[0]?.high, 13)
  assert.equal(out[0]?.low, 9)
  assert.equal(out[0]?.volume, 600)
})

test('resampleKlinesWeekly groups by calendar week', () => {
  const out = resampleKlinesWeekly(daily)
  assert.ok(out.length >= 2)
  assert.equal(out[0]?.open, 10)
  assert.equal(out[out.length - 1]?.close, 13)
})

test('resampleKlinesMonthly groups by calendar month', () => {
  const rows = [
    ...daily,
    { code: '00700', date: '2024-02-01', open: 13, high: 14, low: 12.5, close: 13.5, volume: 100, amount: 1000, changePct: 1, turnoverRate: null },
  ]
  const out = resampleKlinesMonthly(rows)
  assert.equal(out.length, 2)
  assert.equal(out[0]?.date, '2024-01-09')
  assert.equal(out[1]?.date, '2024-02-01')
})

test('filterKlinesByCalendarYears keeps recent daily bars', () => {
  const rows = [
    { code: 'AAPL', date: '2020-01-02', open: 1, high: 2, low: 1, close: 1.5, volume: 1, amount: 1, changePct: null, turnoverRate: null },
    { code: 'AAPL', date: '2024-06-01', open: 2, high: 3, low: 2, close: 2.5, volume: 1, amount: 1, changePct: null, turnoverRate: null },
  ]
  const out = filterKlinesByCalendarYears(rows, 1)
  assert.equal(out.length, 1)
  assert.equal(out[0]?.date, '2024-06-01')
})

test('deriveCrossMarketKlinesFromDaily supports year views', () => {
  const out = deriveCrossMarketKlinesFromDaily(daily, 'year1')
  assert.equal(out.length, daily.length)
})

test('dailyBarsNeededForCrossMarketPeriod scales fetch count', () => {
  assert.equal(dailyBarsNeededForCrossMarketPeriod('year5', 120), 1300)
  assert.ok(dailyBarsNeededForCrossMarketPeriod('weekly', 160) >= 400)
})
