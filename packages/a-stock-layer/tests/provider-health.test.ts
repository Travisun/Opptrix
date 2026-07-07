import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  ProviderHealthTracker,
  CircuitState,
  FAILURE_THRESHOLD,
  BASE_COOLDOWN_MS,
} from '../src/core/provider-health.js'

describe('ProviderHealthTracker', () => {
  let tracker: ProviderHealthTracker

  beforeEach(() => {
    tracker = new ProviderHealthTracker()
  })

  it('starts in CLOSED state', () => {
    expect(tracker.shouldSkip('zzshare', 'realtime')).toBe(false)
  })

  it('stays CLOSED below failure threshold', () => {
    for (let i = 0; i < FAILURE_THRESHOLD - 1; i++) {
      tracker.recordFailure('zzshare', 'realtime', `error ${i}`)
    }
    expect(tracker.shouldSkip('zzshare', 'realtime')).toBe(false)
  })

  it('trips to OPEN after threshold failures', () => {
    for (let i = 0; i < FAILURE_THRESHOLD; i++) {
      tracker.recordFailure('zzshare', 'realtime', `error ${i}`)
    }
    expect(tracker.shouldSkip('zzshare', 'realtime')).toBe(true)
    const h = tracker.getHealth('zzshare', 'realtime')
    expect(h?.state).toBe(CircuitState.OPEN)
  })

  it('resets consecutive fails on success', () => {
    tracker.recordFailure('zzshare', 'realtime', 'err1')
    tracker.recordFailure('zzshare', 'realtime', 'err2')
    tracker.recordSuccess('zzshare', 'realtime')
    const h = tracker.getHealth('zzshare', 'realtime')
    expect(h?.consecutiveFails).toBe(0)
    expect(h?.state).toBe(CircuitState.CLOSED)
  })

  it('transitions to HALF_OPEN after cooldown', () => {
    vi.useFakeTimers()
    for (let i = 0; i < FAILURE_THRESHOLD; i++) {
      tracker.recordFailure('zzshare', 'realtime', `err`)
    }
    // Still OPEN
    expect(tracker.shouldSkip('zzshare', 'realtime')).toBe(true)
    // Advance past cooldown
    vi.advanceTimersByTime(BASE_COOLDOWN_MS + 1000)
    // Should be HALF_OPEN now (shouldSkip returns false for probe)
    expect(tracker.shouldSkip('zzshare', 'realtime')).toBe(false)
    const h = tracker.getHealth('zzshare', 'realtime')
    expect(h?.state).toBe(CircuitState.HALF_OPEN)
    vi.useRealTimers()
  })

  it('closes circuit after successful probe in HALF_OPEN', () => {
    vi.useFakeTimers()
    for (let i = 0; i < FAILURE_THRESHOLD; i++) {
      tracker.recordFailure('zzshare', 'realtime', `err`)
    }
    vi.advanceTimersByTime(BASE_COOLDOWN_MS + 1000)
    tracker.shouldSkip('zzshare', 'realtime') // transition to HALF_OPEN
    tracker.recordSuccess('zzshare', 'realtime')
    const h = tracker.getHealth('zzshare', 'realtime')
    expect(h?.state).toBe(CircuitState.CLOSED)
    vi.useRealTimers()
  })

  it('reopens circuit if probe fails in HALF_OPEN', () => {
    vi.useFakeTimers()
    for (let i = 0; i < FAILURE_THRESHOLD; i++) {
      tracker.recordFailure('zzshare', 'realtime', `err`)
    }
    vi.advanceTimersByTime(BASE_COOLDOWN_MS + 1000)
    tracker.shouldSkip('zzshare', 'realtime')
    tracker.recordFailure('zzshare', 'realtime', 'probe failed')
    const h = tracker.getHealth('zzshare', 'realtime')
    expect(h?.state).toBe(CircuitState.OPEN)
    vi.useRealTimers()
  })

  it('tracks per-capability independently', () => {
    tracker.recordFailure('zzshare', 'realtime', 'err')
    tracker.recordFailure('zzshare', 'realtime', 'err')
    tracker.recordFailure('zzshare', 'realtime', 'err')
    // realtime should be open, kline should be fine
    expect(tracker.shouldSkip('zzshare', 'realtime')).toBe(true)
    expect(tracker.shouldSkip('zzshare', 'kline')).toBe(false)
  })

  it('forceClose resets circuit', () => {
    for (let i = 0; i < FAILURE_THRESHOLD; i++) {
      tracker.recordFailure('zzshare', 'realtime', 'err')
    }
    tracker.forceClose('zzshare', 'realtime')
    const h = tracker.getHealth('zzshare', 'realtime')
    expect(h?.state).toBe(CircuitState.CLOSED)
    expect(h?.consecutiveFails).toBe(0)
  })

  it('prune removes stale entries', () => {
    tracker.recordFailure('zzshare', 'realtime', 'err')
    const h = tracker.getHealth('zzshare', 'realtime')!
    h.lastFailAt = Date.now() - 2_000_000 // 33 min ago
    const removed = tracker.prune()
    expect(removed).toBe(1)
    expect(tracker.getHealth('zzshare', 'realtime')).toBeUndefined()
  })

  it('records invalid responses as soft failures', () => {
    for (let i = 0; i < FAILURE_THRESHOLD; i++) {
      tracker.recordInvalidResponse('zzshare', 'realtime')
    }
    expect(tracker.shouldSkip('zzshare', 'realtime')).toBe(true)
  })
})
