import test from 'node:test'
import assert from 'node:assert/strict'
import { inferMarketFromSymbol } from '../packages/a-stock-layer/dist/core/instrument.js'
import { toTickflowSymbol } from '../packages/a-stock-layer/dist/providers/tickflow/api/symbols.js'
import { mapTickflowQuote } from '../packages/a-stock-layer/dist/providers/tickflow/normalize/quotes.js'

test('inferMarketFromSymbol treats AAPL as US not crypto', () => {
  assert.equal(inferMarketFromSymbol('AAPL'), 'US')
})

test('toTickflowSymbol maps bare US ticker to AAPL.US', () => {
  assert.equal(toTickflowSymbol('AAPL'), 'AAPL.US')
})

test('mapTickflowQuote treats large change_pct as percent not decimal', () => {
  const row = mapTickflowQuote({
    symbol: 'AAPL.US',
    last_price: 190,
    prev_close: 188,
    ext: { change_pct: 9.42 },
  })
  assert.ok(row)
  assert.equal(row.changePct, 9.42)
})

test('mapTickflowQuote maps US session label and valuation fields from ext', () => {
  const row = mapTickflowQuote({
    symbol: 'AAPL.US',
    last_price: 190,
    prev_close: 188,
    open: 189,
    high: 191,
    low: 188.5,
    volume: 1_000_000,
    amount: 190_000_000,
    session: 'regular',
    ext: {
      name: 'Apple Inc.',
      change_pct: 0.01,
      pe: 28.5,
      market_cap: 3e12,
      week52_high: 200,
      week52_low: 150,
      currency: 'USD',
    },
  })
  assert.ok(row)
  assert.equal(row.code, 'AAPL')
  assert.equal(row.name, 'Apple Inc.')
  assert.equal(row.sessionLabel, '盘中')
  assert.equal(row.pe, 28.5)
  assert.equal(row.marketCap, 3e12)
  assert.equal(row.week52High, 200)
  assert.equal(row.currency, 'USD')
  assert.equal(row.changePct, 1)
})

test('mapTickflowQuote scales SDK decimal pct fields (0.01 = 1%)', () => {
  const row = mapTickflowQuote({
    symbol: '600519.SH',
    last_price: 1800,
    prev_close: 1780,
    ext: {
      name: '贵州茅台',
      change_pct: 0.0112,
      turnover_rate: 0.0045,
      amplitude: 0.023,
    },
  })
  assert.ok(row)
  assert.equal(row.changePct, 1.12)
  assert.equal(row.turnoverRate, 0.45)
  assert.equal(row.amplitude, 2.3)
})
