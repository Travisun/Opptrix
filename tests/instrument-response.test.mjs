import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  normalizeInstrumentChart,
  normalizeInstrumentSnapshot,
  klinesToChartBars,
  quoteFromProviderRow,
} from '../packages/shared/dist/instrument-response.js'

test('quoteFromProviderRow normalizes camelCase provider row', () => {
  const q = quoteFromProviderRow(
    { market: 'US', assetClass: 'EQUITY', symbol: 'AAPL' },
    { name: 'Apple', price: 190, changePct: 1.2, volume: 1000 },
  )
  assert.equal(q.code, 'AAPL')
  assert.equal(q.change_pct, 1.2)
  assert.equal(q.market, 'US')
})

test('quoteFromProviderRow preserves extended CN quote fields', () => {
  const q = quoteFromProviderRow(
    { market: 'CN', assetClass: 'EQUITY', symbol: '600519' },
    {
      name: '贵州茅台',
      price: 1700,
      changePct: 0.5,
      open: 1690,
      high: 1710,
      low: 1688,
      preClose: 1691,
      turnoverRate: 0.32,
      pe: 28.5,
      pb: 8.2,
      volume: 12000,
      amount: 2e9,
    },
  )
  assert.equal(q.open, 1690)
  assert.equal(q.pre_close, 1691)
  assert.equal(q.turnover_rate, 0.32)
  assert.equal(q.pe, 28.5)
})

test('klinesToChartBars maps StockKline shape', () => {
  const bars = klinesToChartBars([
    { code: '600519', date: '2024-01-02', open: 1, high: 2, low: 0.5, close: 1.5, volume: 100, amount: 200, changePct: 1, turnoverRate: 0.5 },
  ])
  assert.equal(bars[0]?.time, '2024-01-02')
  assert.equal(bars[0]?.close, 1.5)
})

test('normalizeInstrumentChart wraps cross-market kline items', () => {
  const chart = normalizeInstrumentChart(
    { market: 'US', assetClass: 'EQUITY', symbol: 'AAPL' },
    'daily',
    {
      symbol: 'AAPL',
      items: [{ code: 'AAPL', date: '2024-01-02', open: 1, high: 2, low: 0.5, close: 1.5, volume: 100, amount: 200, changePct: 1, turnoverRate: null }],
      count: 1,
    },
  )
  assert.equal(chart.code, 'AAPL')
  assert.equal(chart.bars.length, 1)
  assert.equal(chart.bars[0]?.close, 1.5)
})

test('normalizeInstrumentSnapshot attaches local_insights in extras', () => {
  const snap = normalizeInstrumentSnapshot(
    { market: 'CN', assetClass: 'EQUITY', symbol: '600519' },
    {
      code: '600519',
      name: '贵州茅台',
      quote: { code: '600519', name: '贵州茅台', price: 1700, changePct: 0.5 },
      profile: { code: '600519', industry: '白酒' },
      financial: null,
    },
    {
      localInsights: {
        trade_date: '2024-06-01',
        total_score: 72,
        scorecard: '综合评估',
        pe: 30,
        pb: 8,
        pe_percentile: 65,
        pb_percentile: 70,
      },
      source: 'mixed',
    },
  )
  assert.equal(snap.instrument.symbol, '600519')
  assert.equal(snap.extras?.local_insights?.total_score, 72)
  assert.equal(snap.source, 'mixed')
})
