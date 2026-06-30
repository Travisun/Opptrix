import assert from 'node:assert/strict'
import test from 'node:test'
import { buildTrendBrief } from '../packages/t-strategy/dist/trend-brief.js'

function syntheticKlines(days = 120, start = 100) {
  const rows = []
  let price = start
  for (let i = 0; i < days; i++) {
    const drift = Math.sin(i / 8) * 0.4 + 0.05
    price = Math.max(1, price * (1 + drift / 100))
    const date = `2025-${String(Math.floor(i / 28) + 1).padStart(2, '0')}-${String((i % 28) + 1).padStart(2, '0')}`
    rows.push({
      code: '600519',
      date,
      open: price * 0.99,
      high: price * 1.01,
      low: price * 0.98,
      close: price,
      volume: 1_000_000 + (i % 5) * 100_000,
      amount: price * 1_000_000,
      changePct: drift,
      turnoverRate: null,
    })
  }
  return rows
}

test('buildTrendBrief returns grouped human-readable strips', () => {
  const brief = buildTrendBrief({
    code: '600519',
    name: '贵州茅台',
    klines: syntheticKlines(),
    holdingCost: 1800,
  })
  assert.equal(brief.code, '600519')
  assert.ok(brief.strips.length >= 8)
  assert.ok(brief.strips.some(s => s.group === 'trend' && s.title === '短期趋势'))
  assert.ok(brief.strips.some(s => s.group === 'volume'))
  assert.ok(brief.strips.some(s => s.group === 'risk'))
  assert.ok(brief.strips.some(s => s.group === 'holding'))
  for (const strip of brief.strips) {
    assert.ok(strip.status.length > 0)
    assert.ok(strip.detail.length > 4)
  }
})
