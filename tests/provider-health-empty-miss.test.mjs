/**
 * Provider health: 业务空结果不打开熔断；真实失败仍 OPEN；reset 可恢复。
 */
import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import {
  CircuitState,
  FAILURE_THRESHOLD,
  getProviderHealthTracker,
  resetProviderHealthTracker,
} from '../packages/a-stock-layer/dist/core/provider-health.js'
import {
  recordProviderQueryEmpty,
  recordProviderQueryError,
} from '../packages/a-stock-layer/dist/core/free-provider-throttle.js'

const PROVIDER = 'tickflow'
const CAP = 'STOCK_REALTIME'

describe('provider health empty miss vs hard failure', () => {
  beforeEach(() => {
    resetProviderHealthTracker()
  })

  afterEach(() => {
    resetProviderHealthTracker()
  })

  it('consecutive empty misses do not open the circuit', () => {
    const health = getProviderHealthTracker()
    for (let i = 0; i < FAILURE_THRESHOLD + 5; i++) {
      recordProviderQueryEmpty(PROVIDER, CAP, health)
    }
    const h = health.getHealth(PROVIDER, CAP)
    assert.ok(h)
    assert.equal(h.state, CircuitState.CLOSED)
    assert.equal(h.consecutiveFails, 0)
    assert.ok(h.totalFails >= FAILURE_THRESHOLD + 5)
    assert.equal(health.shouldSkip(PROVIDER, CAP), false)
  })

  it('consecutive real failures still open the circuit', () => {
    const health = getProviderHealthTracker()
    for (let i = 0; i < FAILURE_THRESHOLD; i++) {
      recordProviderQueryError(PROVIDER, CAP, new Error('timeout'), health)
    }
    const h = health.getHealth(PROVIDER, CAP)
    assert.ok(h)
    assert.equal(h.state, CircuitState.OPEN)
    assert.ok(h.consecutiveFails >= FAILURE_THRESHOLD)
    assert.equal(health.shouldSkip(PROVIDER, CAP), true)
  })

  it('resetProviderHealth clears open circuit for provider', () => {
    const health = getProviderHealthTracker()
    for (let i = 0; i < FAILURE_THRESHOLD; i++) {
      health.recordFailure(PROVIDER, CAP, 'boom')
    }
    assert.equal(health.getHealth(PROVIDER, CAP)?.state, CircuitState.OPEN)
    health.reset(PROVIDER)
    assert.equal(health.getHealth(PROVIDER, CAP), undefined)
    assert.equal(health.shouldSkip(PROVIDER, CAP), false)
  })
})
