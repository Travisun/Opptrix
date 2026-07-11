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
  assert.equal(q.code, 'US:AAPL')
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
  assert.equal(q.code, 'CN:SH.600519')
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
  assert.equal(chart.code, 'US:AAPL')
  assert.equal(chart.bars.length, 1)
  assert.equal(chart.bars[0]?.close, 1.5)
})

test('normalizeInstrumentChart passes cross-market has_more', () => {
  const chart = normalizeInstrumentChart(
    { market: 'US', assetClass: 'EQUITY', symbol: 'AAPL' },
    'daily',
    {
      symbol: 'AAPL',
      items: [{ code: 'AAPL', date: '2024-01-02', open: 1, high: 1, low: 1, close: 1, volume: 1, amount: 1, changePct: 0, turnoverRate: null }],
      indicators: [],
      count: 1,
      hasMore: true,
    },
  )
  assert.equal(chart.has_more, true)
})

test('normalizeInstrumentChart passes cross-market indicators', () => {
  const chart = normalizeInstrumentChart(
    { market: 'HK', assetClass: 'EQUITY', symbol: '00700' },
    'daily',
    {
      symbol: '00700',
      items: [{ code: '00700', date: '2024-01-02', open: 300, high: 310, low: 295, close: 305, volume: 1000, amount: 305000, changePct: 1.2, turnoverRate: null }],
      indicators: [{ time: '2024-01-02', ma5: 302, ma10: 298, ma20: 290, ma60: 280, macd: 1.2, macdSignal: 0.8, macdHist: 0.4 }],
      count: 1,
    },
  )
  assert.equal(chart.code, 'HK:00700')
  assert.equal(chart.indicators?.length, 1)
  assert.equal(chart.indicators?.[0]?.ma5, 302)
  assert.equal(chart.indicators?.[0]?.macdHist, 0.4)
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
