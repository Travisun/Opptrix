import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  ProviderHealthTracker,
  CircuitState,
  FAILURE_THRESHOLD,
  BASE_COOLDOWN_MS,
  MAX_COOLDOWN_MS,
} from '../src/core/provider-health.js'

/**
 * Integration test: multi-provider fallback with circuit breaker.
 *
 * Scenario:
 *   Provider A (eastmoney) — primary, flaky
 *   Provider B (sina)      — secondary, stable
 *   Provider C (netease)   — tertiary, always fails
 *
 * Simulates the engine's queryScoped loop with health tracking.
 */

interface MockProvider {
  name: string
  shouldFail: boolean
  failMessage?: string
  callCount: number
}

function createMockProvider(name: string, fail = false, msg = 'network error'): MockProvider {
  return { name, shouldFail: fail, failMessage: msg, callCount: 0 }
}

async function simulateQueryScoped(
  providers: MockProvider[],
  health: ProviderHealthTracker,
  capability: string,
  args: unknown[] = [],
): Promise<{ success: boolean; source?: string; error?: string; attempts: string[] }> {
  const attempts: string[] = []

  for (const p of providers) {
    if (health.shouldSkip(p.name, capability)) {
      const h = health.getHealth(p.name, capability)
      attempts.push(`SKIP:${p.name}(state=${h?.state})`)
      continue
    }

    attempts.push(`TRY:${p.name}`)
    p.callCount++

    if (p.shouldFail) {
      health.recordFailure(p.name, capability, p.failMessage!)
      continue
    }

    // Simulate empty response
    if (args.includes('empty')) {
      health.recordInvalidResponse(p.name, capability)
      continue
    }

    health.recordSuccess(p.name, capability)
    return { success: true, source: p.name, attempts }
  }

  return { success: false, error: 'all providers failed', attempts }
}

describe('Multi-provider fallback integration', () => {
  let health: ProviderHealthTracker
  let eastmoney: MockProvider
  let sina: MockProvider
  let netease: MockProvider

  beforeEach(() => {
    health = new ProviderHealthTracker()
    eastmoney = createMockProvider('eastmoney', false)
    sina = createMockProvider('sina', false)
    netease = createMockProvider('netease', true, 'connection refused')
  })

  it('primary succeeds on first try — no fallback', async () => {
    const result = await simulateQueryScoped(
      [eastmoney, sina, netease],
      health,
      'realtime',
    )

    expect(result.success).toBe(true)
    expect(result.source).toBe('eastmoney')
    expect(result.attempts).toEqual(['TRY:eastmoney'])
    expect(eastmoney.callCount).toBe(1)
    expect(sina.callCount).toBe(0)
  })

  it('primary fails → falls to secondary', async () => {
    eastmoney.shouldFail = true

    const result = await simulateQueryScoped(
      [eastmoney, sina, netease],
      health,
      'realtime',
    )

    expect(result.success).toBe(true)
    expect(result.source).toBe('sina')
    expect(result.attempts).toEqual(['TRY:eastmoney', 'TRY:sina'])
  })

  it('all providers fail → returns error', async () => {
    eastmoney.shouldFail = true
    sina.shouldFail = true

    const result = await simulateQueryScoped(
      [eastmoney, sina, netease],
      health,
      'realtime',
    )

    expect(result.success).toBe(false)
    expect(result.attempts).toEqual(['TRY:eastmoney', 'TRY:sina', 'TRY:netease'])
  })

  it('primary trips circuit after 3 failures → skips to secondary', async () => {
    eastmoney.shouldFail = true

    // Run 3 times to trip the circuit
    for (let i = 0; i < FAILURE_THRESHOLD; i++) {
      await simulateQueryScoped([eastmoney, sina, netease], health, 'realtime')
    }

    // 4th query: eastmoney should be skipped
    sina.shouldFail = false
    const result = await simulateQueryScoped(
      [eastmoney, sina, netease],
      health,
      'realtime',
    )

    expect(result.success).toBe(true)
    expect(result.source).toBe('sina')
    // eastmoney was skipped (not tried)
    expect(result.attempts[0]).toMatch(/^SKIP:eastmoney/)
    expect(eastmoney.callCount).toBe(FAILURE_THRESHOLD) // only 3 calls total
  })

  it('per-capability isolation: realtime circuit open, kline works', async () => {
    eastmoney.shouldFail = true

    // Trip circuit for realtime
    for (let i = 0; i < FAILURE_THRESHOLD; i++) {
      await simulateQueryScoped([eastmoney, sina], health, 'realtime')
    }

    // kline on same provider should still work
    eastmoney.shouldFail = false
    const result = await simulateQueryScoped(
      [eastmoney, sina],
      health,
      'kline',
    )

    expect(result.success).toBe(true)
    expect(result.source).toBe('eastmoney')
  })

  it('recovery after cooldown — HALF_OPEN probe succeeds', async () => {
    vi.useFakeTimers()
    eastmoney.shouldFail = true

    // Trip circuit
    for (let i = 0; i < FAILURE_THRESHOLD; i++) {
      await simulateQueryScoped([eastmoney, sina], health, 'realtime')
    }

    // Confirm circuit is open
    expect(health.shouldSkip('eastmoney', 'realtime')).toBe(true)

    // Advance past cooldown
    vi.advanceTimersByTime(BASE_COOLDOWN_MS + 1000)

    // Now eastmoney is back online — probe should succeed
    eastmoney.shouldFail = false
    const result = await simulateQueryScoped(
      [eastmoney, sina],
      health,
      'realtime',
    )

    expect(result.success).toBe(true)
    expect(result.source).toBe('eastmoney')
    expect(health.getHealth('eastmoney', 'realtime')?.state).toBe(CircuitState.CLOSED)
    vi.useRealTimers()
  })

  it('recovery fails → reopens circuit with longer cooldown', async () => {
    vi.useFakeTimers()
    eastmoney.shouldFail = true

    // Trip circuit
    for (let i = 0; i < FAILURE_THRESHOLD; i++) {
      await simulateQueryScoped([eastmoney, sina], health, 'realtime')
    }

    vi.advanceTimersByTime(BASE_COOLDOWN_MS + 1000)

    // Probe fails again
    const result = await simulateQueryScoped(
      [eastmoney, sina],
      health,
      'realtime',
    )

    expect(result.success).toBe(true) // sina saved us
    expect(result.source).toBe('sina')

    const h = health.getHealth('eastmoney', 'realtime')!
    expect(h.state).toBe(CircuitState.OPEN)
    // Cooldown should be longer (4 failures now)
    expect(h.cooldownUntil - Date.now()).toBeGreaterThan(BASE_COOLDOWN_MS)
    vi.useRealTimers()
  })

  it('empty responses count as failures for circuit breaker', async () => {
    // eastmoney returns empty data; sina is healthy
    const emptyEastmoney = { ...eastmoney, shouldFail: false }
    const calls: string[] = []
    const emptyCap = 'realtime_empty'

    async function simulateEmptyFirst() {
      for (const p of [emptyEastmoney, sina]) {
        if (health.shouldSkip(p.name, emptyCap)) {
          calls.push(`SKIP:${p.name}`)
          continue
        }
        calls.push(`TRY:${p.name}`)
        // eastmoney always returns empty
        if (p.name === 'eastmoney') {
          health.recordInvalidResponse(p.name, emptyCap)
          continue
        }
        health.recordSuccess(p.name, emptyCap)
        return { success: true, source: p.name }
      }
      return { success: false }
    }

    const result = await simulateEmptyFirst()

    expect(result.success).toBe(true)
    expect(result.source).toBe('sina')
    // eastmoney's invalid response was recorded
    const h = health.getHealth('eastmoney', emptyCap)!
    expect(h.consecutiveFails).toBe(1)
    expect(h.lastError).toBe('invalid_response')
  })

  it('forceClose allows immediate retry', async () => {
    eastmoney.shouldFail = true

    // Trip circuit
    for (let i = 0; i < FAILURE_THRESHOLD; i++) {
      await simulateQueryScoped([eastmoney, sina], health, 'realtime')
    }

    // Manual recovery
    health.forceClose('eastmoney', 'realtime')
    eastmoney.shouldFail = false

    const result = await simulateQueryScoped(
      [eastmoney, sina],
      health,
      'realtime',
    )

    expect(result.success).toBe(true)
    expect(result.source).toBe('eastmoney')
  })

  it('exponential cooldown increases with consecutive failures', () => {
    vi.useFakeTimers()

    // 3 failures → ~30s cooldown
    for (let i = 0; i < 3; i++) {
      health.recordFailure('p', 'c', 'err')
    }
    const h3 = health.getHealth('p', 'c')!
    const cd3 = h3.cooldownUntil - Date.now()
    expect(cd3).toBeGreaterThan(20_000)
    expect(cd3).toBeLessThan(40_000)

    // 5 failures → ~120s cooldown
    for (let i = 0; i < 2; i++) {
      health.recordFailure('p', 'c', 'err')
    }
    const h5 = health.getHealth('p', 'c')!
    const cd5 = h5.cooldownUntil - Date.now()
    expect(cd5).toBeGreaterThan(80_000)
    expect(cd5).toBeLessThan(160_000)

    // 8 failures → capped at 600s
    for (let i = 0; i < 3; i++) {
      health.recordFailure('p', 'c', 'err')
    }
    const h8 = health.getHealth('p', 'c')!
    const cd8 = h8.cooldownUntil - Date.now()
    expect(cd8).toBeGreaterThan(400_000)
    expect(cd8).toBeLessThanOrEqual(MAX_COOLDOWN_MS * 1.1) // +10% jitter

    vi.useRealTimers()
  })

  it('stats tracking across mixed success/failure', async () => {
    eastmoney.shouldFail = true
    await simulateQueryScoped([eastmoney, sina], health, 'realtime')

    eastmoney.shouldFail = false
    await simulateQueryScoped([eastmoney, sina], health, 'realtime')

    const h = health.getHealth('eastmoney', 'realtime')!
    expect(h.totalFails).toBe(1)
    expect(h.totalSuccesses).toBe(1)
    expect(h.consecutiveFails).toBe(0) // success reset it
  })

  it('reset clears all state for a provider', async () => {
    eastmoney.shouldFail = true
    for (let i = 0; i < FAILURE_THRESHOLD; i++) {
      await simulateQueryScoped([eastmoney, sina], health, 'realtime')
    }

    health.reset('eastmoney')
    expect(health.getHealth('eastmoney', 'realtime')).toBeUndefined()

    // Should work again
    const result = await simulateQueryScoped(
      [eastmoney, sina],
      health,
      'realtime',
    )
    expect(result.attempts[0]).toBe('TRY:eastmoney')
  })
})
