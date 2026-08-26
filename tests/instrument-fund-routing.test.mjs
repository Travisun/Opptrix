import assert from 'node:assert/strict'
import test from 'node:test'
import { buildInstrumentNamespace, normalizeInstrumentRef, parseInstrumentNamespace } from '@opptrix/shared'
import { resolveInstrumentQueryPlan } from '@opptrix/a-stock-layer'

test('CN:PF namespace parses to FUND assetClass', () => {
  const ref = parseInstrumentNamespace('CN:PF.110022')
  assert.ok(ref)
  assert.equal(ref.market, 'CN')
  assert.equal(ref.assetClass, 'FUND')
  assert.equal(ref.symbol, '110022')
  assert.equal(ref.exchange, 'PF')
  assert.equal(buildInstrumentNamespace(ref), 'CN:PF.110022')
})

test('CN:OF legacy namespace maps to CN:PF', () => {
  const ref = parseInstrumentNamespace('CN:OF.110022')
  assert.ok(ref)
  assert.equal(ref.exchange, 'PF')
  assert.equal(buildInstrumentNamespace(ref), 'CN:PF.110022')
})

test('listed ETF code is not rewritten to CN:PF', () => {
  const ref = normalizeInstrumentRef({
    market: 'CN',
    assetClass: 'FUND',
    symbol: '510330',
    exchange: 'PF',
  })
  assert.equal(ref.assetClass, 'ETF')
  assert.equal(ref.exchange, 'SH')
  assert.equal(buildInstrumentNamespace(ref), 'CN:SH.510330')
  const navPlan = resolveInstrumentQueryPlan(ref, 'fund_nav')
  assert.equal(navPlan, null)
})

test('resolveInstrumentQueryPlan routes FUND capabilities', () => {
  const ref = normalizeInstrumentRef({
    market: 'CN',
    assetClass: 'FUND',
    symbol: '110022',
    exchange: 'PF',
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

  for (const cap of ['fund_quote', 'realtime']) {
    const quotePlan = resolveInstrumentQueryPlan(ref, cap)
    assert.ok(quotePlan, cap)
    assert.equal(quotePlan?.kind, 'registry', cap)
    if (quotePlan?.kind === 'registry') {
      assert.equal(quotePlan.method, 'fundQuote', cap)
      assert.equal(quotePlan.useCache, true, `${cap} 应启用后端缓存`)
    }
  }

  const detailCaps = [
    ['fund_returns', 'fundReturns'],
    ['fund_drawdown', 'fundDrawdown'],
    ['fund_allocation', 'fundAllocation'],
    ['fund_holders', 'fundHolders'],
    ['fund_dividend', 'fundDividend'],
    ['fund_manager', 'fundManager'],
    ['fund_diagnosis', 'fundDiagnosis'],
    ['fund_news', 'fundNews'],
    ['fund_financials', 'fundFinancials'],
  ]
  for (const [cap, method] of detailCaps) {
    const plan = resolveInstrumentQueryPlan(ref, cap)
    assert.ok(plan, cap)
    assert.equal(plan?.kind, 'registry', cap)
    if (plan?.kind === 'registry') {
      assert.equal(plan.method, method, cap)
      assert.equal(plan.assetClass, 'FUND', cap)
    }
  }
})

test('ETF assetClass does not route as FUND', () => {
  const ref = normalizeInstrumentRef({
    market: 'CN',
    assetClass: 'ETF',
    symbol: '510300',
    exchange: 'SH',
  })
  const plan = resolveInstrumentQueryPlan(ref, 'fund_nav')
  assert.equal(plan, null)
})

test('resolveInstrumentQueryPlan routes REIT fund_snapshot with ref (not bare FUND profile)', () => {
  const ref = normalizeInstrumentRef({
    market: 'CN',
    assetClass: 'REIT',
    symbol: '180102',
    exchange: 'SZ',
  })
  const snapPlan = resolveInstrumentQueryPlan(ref, 'fund_snapshot')
  assert.ok(snapPlan)
  assert.equal(snapPlan?.kind, 'composite_snapshot')
  if (snapPlan?.kind === 'composite_snapshot') {
    assert.equal(snapPlan.assetClass, 'REIT')
    assert.equal(snapPlan.ref?.assetClass, 'REIT')
    assert.equal(snapPlan.ref?.exchange, 'SZ')
  }
  const profilePlan = resolveInstrumentQueryPlan(ref, 'fund_profile')
  assert.ok(profilePlan)
  if (profilePlan?.kind === 'registry') {
    assert.equal(profilePlan.assetClass, 'REIT')
    assert.equal(profilePlan.method, 'fundProfile')
  }
  const allocationPlan = resolveInstrumentQueryPlan(ref, 'fund_allocation')
  assert.ok(allocationPlan)
  if (allocationPlan?.kind === 'registry') {
    assert.equal(allocationPlan.assetClass, 'REIT')
    assert.equal(allocationPlan.method, 'fundAllocation')
  }
  const holdingsPlan = resolveInstrumentQueryPlan(ref, 'fund_holdings')
  assert.ok(holdingsPlan)
  if (holdingsPlan?.kind === 'registry') {
    assert.equal(holdingsPlan.assetClass, 'REIT')
    assert.equal(holdingsPlan.method, 'fundHoldings')
  }
})
