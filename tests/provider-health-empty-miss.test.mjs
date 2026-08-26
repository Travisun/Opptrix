/**
 * Provider health: 业务空结果 / business / rate_limited 不打开熔断；
 * transport / auth 仍 OPEN；reset 可恢复。
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
  classifyProviderQueryError,
} from '../packages/a-stock-layer/dist/core/free-provider-throttle.js'
import {
  clearAllProviderPermissionDenials,
  isProviderCapabilityDenied,
} from '../packages/a-stock-layer/dist/providers/common/permission-denial.js'

const PROVIDER = 'tickflow'
const CAP = 'STOCK_REALTIME'

describe('provider health empty miss vs hard failure', () => {
  beforeEach(() => {
    resetProviderHealthTracker()
    clearAllProviderPermissionDenials()
  })

  afterEach(() => {
    resetProviderHealthTracker()
    clearAllProviderPermissionDenials()
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

  it('business 积分不足 × FAILURE_THRESHOLD+ stays CLOSED', () => {
    const health = getProviderHealthTracker()
    for (let i = 0; i < FAILURE_THRESHOLD + 5; i++) {
      recordProviderQueryError(PROVIDER, CAP, new Error('积分不足'), health)
    }
    const h = health.getHealth(PROVIDER, CAP)
    assert.ok(h)
    assert.equal(h.state, CircuitState.CLOSED)
    assert.equal(h.consecutiveFails, 0)
    assert.equal(health.shouldSkip(PROVIDER, CAP), false)
    assert.equal(isProviderCapabilityDenied(PROVIDER, CAP), false)
  })

  it('rate_limited HTTP 429 × N stays CLOSED', () => {
    const health = getProviderHealthTracker()
    for (let i = 0; i < FAILURE_THRESHOLD + 5; i++) {
      recordProviderQueryError(PROVIDER, CAP, new Error('HTTP 429'), health)
    }
    const h = health.getHealth(PROVIDER, CAP)
    assert.ok(h)
    assert.equal(h.state, CircuitState.CLOSED)
    assert.equal(h.consecutiveFails, 0)
    assert.equal(health.shouldSkip(PROVIDER, CAP), false)
  })

  it('rate_limited 配额用尽 × N stays CLOSED', () => {
    const health = getProviderHealthTracker()
    for (let i = 0; i < FAILURE_THRESHOLD + 3; i++) {
      recordProviderQueryError(PROVIDER, CAP, new Error('配额用尽'), health)
    }
    assert.equal(health.getHealth(PROVIDER, CAP)?.state, CircuitState.CLOSED)
    assert.equal(health.shouldSkip(PROVIDER, CAP), false)
  })

  it('auth HTTP 401 × FAILURE_THRESHOLD opens circuit and records denial', () => {
    const health = getProviderHealthTracker()
    for (let i = 0; i < FAILURE_THRESHOLD; i++) {
      recordProviderQueryError(PROVIDER, CAP, new Error('HTTP 401'), health)
    }
    const h = health.getHealth(PROVIDER, CAP)
    assert.ok(h)
    assert.equal(h.state, CircuitState.OPEN)
    assert.equal(health.shouldSkip(PROVIDER, CAP), true)
    assert.equal(isProviderCapabilityDenied(PROVIDER, CAP), true)
  })

  it('auth invalid api key × FAILURE_THRESHOLD opens circuit', () => {
    const health = getProviderHealthTracker()
    for (let i = 0; i < FAILURE_THRESHOLD; i++) {
      recordProviderQueryError(PROVIDER, CAP, new Error('invalid api key'), health)
    }
    assert.equal(health.getHealth(PROVIDER, CAP)?.state, CircuitState.OPEN)
    assert.equal(isProviderCapabilityDenied(PROVIDER, CAP), true)
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

describe('classifyProviderQueryError', () => {
  it('classifies rate_limited / auth / business / transport', () => {
    assert.equal(classifyProviderQueryError(new Error('HTTP 429')), 'rate_limited')
    assert.equal(classifyProviderQueryError(new Error('配额用尽')), 'rate_limited')
    assert.equal(classifyProviderQueryError(new Error('HTTP 401')), 'auth')
    assert.equal(classifyProviderQueryError(new Error('invalid api key')), 'auth')
    assert.equal(classifyProviderQueryError(new Error('积分不足')), 'business')
    assert.equal(classifyProviderQueryError(new Error('无接口访问权限')), 'business')
    assert.equal(classifyProviderQueryError(new Error('NO_API_PERMISSION')), 'business')
    assert.equal(classifyProviderQueryError(new Error('HTTP 403')), 'business')
    assert.equal(classifyProviderQueryError(new Error('timeout')), 'transport')
    assert.equal(classifyProviderQueryError(new Error('HTTP 502')), 'transport')
    assert.equal(classifyProviderQueryError(new Error('fetch failed')), 'transport')
    assert.equal(classifyProviderQueryError(new Error('something odd')), 'business')
  })

  it('reads error.status when present', () => {
    assert.equal(classifyProviderQueryError({ status: 429, message: 'x' }), 'rate_limited')
    assert.equal(classifyProviderQueryError({ status: 401, message: 'x' }), 'auth')
    assert.equal(classifyProviderQueryError({ status: 403, message: 'x' }), 'business')
    assert.equal(classifyProviderQueryError({ status: 503, message: 'x' }), 'transport')
  })
})
