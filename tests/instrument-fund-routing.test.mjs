import assert from 'node:assert/strict'
import test from 'node:test'
import { buildInstrumentNamespace, normalizeInstrumentRef, parseInstrumentNamespace } from '@opptrix/shared'
import { resolveInstrumentQueryPlan } from '@opptrix/a-stock-layer'

test('CN:OF namespace parses to FUND assetClass', () => {
  const ref = parseInstrumentNamespace('CN:OF.110022')
  assert.ok(ref)
  assert.equal(ref.market, 'CN')
  assert.equal(ref.assetClass, 'FUND')
  assert.equal(ref.symbol, '110022')
  assert.equal(ref.exchange, 'OF')
  assert.equal(buildInstrumentNamespace(ref), 'CN:OF.110022')
})

test('resolveInstrumentQueryPlan routes FUND capabilities', () => {
  const ref = normalizeInstrumentRef({
    market: 'CN',
    assetClass: 'FUND',
    symbol: '110022',
    exchange: 'OF',
  })
  const navPlan = resolveInstrumentQueryPlan(ref, 'fund_nav')
  assert.ok(navPlan)
  assert.equal(navPlan?.kind, 'registry')
  if (navPlan?.kind === 'registry') {
    assert.equal(navPlan.assetClass, 'FUND')
    assert.equal(navPlan.method, 'fundNav')
  }
  const snapPlan = resolveInstrumentQueryPlan(ref, 'fund_snapshot')
  assert.ok(snapPlan)
  assert.equal(snapPlan?.kind, 'composite_snapshot')
})

test('ETF code does not route as FUND', () => {
  const ref = normalizeInstrumentRef({
    market: 'CN',
    assetClass: 'ETF',
    symbol: '510300',
    exchange: 'SH',
  })
  const plan = resolveInstrumentQueryPlan(ref, 'fund_nav')
  assert.equal(plan, null)
})
