import assert from 'node:assert/strict'
import test from 'node:test'
import { DISCOVER_STRATEGIES, getDiscoverStrategy } from '../packages/agent/dist/discover-strategies.js'
import { TEMPLATES } from '../packages/stock-eval/dist/scoring/templates.js'
import { computeMarketRegime } from '../packages/shared/dist/market-regime.js'

test('discover strategies keep online profiles only (no cn equity factor strategies)', () => {
  assert.ok(DISCOVER_STRATEGIES.length >= 8)
  assert.equal(getDiscoverStrategy('graham_margin'), undefined)
  assert.equal(getDiscoverStrategy('gbm_core'), undefined)
  assert.equal(getDiscoverStrategy('buffett_moat'), undefined)
  assert.equal(getDiscoverStrategy('fear_rebound'), undefined)

  const etf = getDiscoverStrategy('etf_low_premium')
  assert.ok(etf)
  assert.deepEqual(etf.applicableProfiles, ['cn_etf'])

  assert.ok(getDiscoverStrategy('us_broad_universe'))
  assert.ok(getDiscoverStrategy('jp_broad_universe'))
  assert.ok(getDiscoverStrategy('kr_broad_universe'))
  assert.ok(getDiscoverStrategy('hk_broad_universe'))

  for (const s of DISCOVER_STRATEGIES) {
    assert.ok(!s.applicableProfiles.includes('cn_equity'), `${s.id} must not target cn_equity`)
  }
})

test('policies-new scorecard templates exist', () => {
  assert.ok(TEMPLATES['G=B+M'])
  assert.ok(TEMPLATES['巴菲特四透镜'])

  const gbmFactors = TEMPLATES['G=B+M'].factors
  const gbmWeight = gbmFactors.reduce((s, f) => s + f.weight, 0)
  assert.ok(Math.abs(gbmWeight - 1) < 0.001, `G=B+M weights sum to ${gbmWeight}`)
})

test('market regime suggests etf strategies in panic', () => {
  const snap = computeMarketRegime({
    index_m6m: -15,
    index_m1m: -8,
    advance_pct: 18,
    limit_down: 90,
    index_pe: 9,
  })
  assert.equal(snap.regime, 'panic')
  assert.ok(snap.suggested_strategy_ids.includes('etf_low_premium'))
  assert.ok(!snap.suggested_strategy_ids.includes('fear_rebound'))
  assert.ok(snap.indicators)
})
