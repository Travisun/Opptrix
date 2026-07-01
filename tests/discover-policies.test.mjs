import assert from 'node:assert/strict'
import test from 'node:test'
import { DISCOVER_STRATEGIES, getDiscoverStrategy } from '../packages/agent/dist/discover-strategies.js'
import { TEMPLATES } from '../packages/stock-eval/dist/scoring/templates.js'
import { computeMarketRegime } from '../packages/shared/dist/market-regime.js'

test('policies-new discover strategies are registered', () => {
  assert.equal(DISCOVER_STRATEGIES.length, 12)
  const gbm = getDiscoverStrategy('gbm_core')
  assert.ok(gbm)
  assert.equal(gbm.scorecard, 'G=B+M')
  assert.equal(gbm.category, 'balanced')

  const fear = getDiscoverStrategy('fear_rebound')
  assert.ok(fear)
  assert.equal(fear.scorecard, '困境反转')
  assert.equal(fear.category, 'contrarian')

  const buffett = getDiscoverStrategy('buffett_moat')
  assert.ok(buffett)
  assert.equal(buffett.scorecard, '巴菲特四透镜')
})

test('policies-new scorecard templates exist', () => {
  assert.ok(TEMPLATES['G=B+M'])
  assert.ok(TEMPLATES['巴菲特四透镜'])

  const gbmFactors = TEMPLATES['G=B+M'].factors
  const gbmWeight = gbmFactors.reduce((s, f) => s + f.weight, 0)
  assert.ok(Math.abs(gbmWeight - 1) < 0.001, `G=B+M weights sum to ${gbmWeight}`)
})

test('market regime suggests fear_rebound in panic', () => {
  const snap = computeMarketRegime({
    index_m6m: -15,
    index_m1m: -8,
    advance_pct: 18,
    limit_down: 90,
    index_pe: 9,
  })
  assert.equal(snap.regime, 'panic')
  assert.ok(snap.suggested_strategy_ids.includes('fear_rebound'))
  assert.ok(snap.indicators)
})
