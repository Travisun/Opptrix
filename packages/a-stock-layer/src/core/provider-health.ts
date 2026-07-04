/**
 * Provider health tracker with circuit breaker per (provider × capability).
 *
 * States:
 *   CLOSED  — normal; requests pass through
 *   OPEN    — tripped after consecutive failures; requests short-circuit
 *   HALF_OPEN — cooldown expired; allow one probe request
 *
 * Backoff formula (科学设置):
 *   cooldown = min(BASE_COOLDOWN_MS × 2^consecutiveFails, MAX_COOLDOWN_MS)
 *   with ±10% jitter to avoid thundering herd.
 */

export enum CircuitState {
  CLOSED = 'closed',
  OPEN = 'open',
  HALF_OPEN = 'half_open',
}

export interface InterfaceHealth {
  consecutiveFails: number
  totalFails: number
  totalSuccesses: number
  lastFailAt: number
  lastSuccessAt: number
  state: CircuitState
  cooldownUntil: number
  /** Last error message (for diagnostics) */
  lastError: string
}

export interface HealthSnapshot {
  [key: string]: InterfaceHealth
}

// ── Tuning knobs ──

/** Failures before circuit trips */
export const FAILURE_THRESHOLD = 3

/** Minimum cooldown after 3 consecutive failures: 30s */
export const BASE_COOLDOWN_MS = 30_000

/** Maximum cooldown cap: 10 minutes */
export const MAX_COOLDOWN_MS = 600_000

/** Jitter range: ±10% */
const JITTER_RATIO = 0.1

/** Successes needed in HALF_OPEN to close the circuit */
export const HALF_OPEN_SUCCESS_THRESHOLD = 1

/** Stale health entries older than this are pruned (30 min) */
export const STALE_THRESHOLD_MS = 1_800_000

// ── Core ──

function jitter(base: number): number {
  const delta = base * JITTER_RATIO
  return base + (Math.random() * 2 - 1) * delta
}

function computeCooldown(consecutiveFails: number): number {
  if (consecutiveFails < FAILURE_THRESHOLD) return 0
  const exponential = BASE_COOLDOWN_MS * Math.pow(2, consecutiveFails - FAILURE_THRESHOLD)
  return Math.min(jitter(exponential), MAX_COOLDOWN_MS)
}

function makeKey(providerId: string, capability: string): string {
  return `${providerId}::${capability}`
}

function parseKey(key: string): [string, string] {
  const idx = key.indexOf('::')
  return [key.slice(0, idx), key.slice(idx + 2)]
}

export class ProviderHealthTracker {
  private store = new Map<string, InterfaceHealth>()
  private halfOpenCounters = new Map<string, number>()

  /**
   * Should this provider×cap combination be skipped right now?
   * Returns true if circuit is OPEN or in HALF_OPEN but probe already sent.
   */
  shouldSkip(providerId: string, capability: string): boolean {
    const key = makeKey(providerId, capability)
    const h = this.store.get(key)
    if (!h) return false

    if (h.state === CircuitState.OPEN) {
      if (Date.now() >= h.cooldownUntil) {
        h.state = CircuitState.HALF_OPEN
        this.halfOpenCounters.set(key, 0)
        return false // allow probe
      }
      return true
    }

    if (h.state === CircuitState.HALF_OPEN) {
      const probes = this.halfOpenCounters.get(key) ?? 0
      if (probes >= HALF_OPEN_SUCCESS_THRESHOLD) return true
      return false
    }

    return false
  }

  /** Record a successful call. Resets consecutive fails, may close circuit. */
  recordSuccess(providerId: string, capability: string): void {
    const key = makeKey(providerId, capability)
    const h = this.getOrCreate(key)
    const now = Date.now()

    h.lastSuccessAt = now
    h.totalSuccesses++

    if (h.state === CircuitState.HALF_OPEN) {
      const probes = (this.halfOpenCounters.get(key) ?? 0) + 1
      this.halfOpenCounters.set(key, probes)
      if (probes >= HALF_OPEN_SUCCESS_THRESHOLD) {
        h.state = CircuitState.CLOSED
        h.consecutiveFails = 0
        h.cooldownUntil = 0
        this.halfOpenCounters.delete(key)
      }
      return
    }

    h.consecutiveFails = 0
    h.state = CircuitState.CLOSED
    h.cooldownUntil = 0
  }

  /** Record a failed call. May trip the circuit. */
  recordFailure(providerId: string, capability: string, errorMsg: string): void {
    const key = makeKey(providerId, capability)
    const h = this.getOrCreate(key)
    const now = Date.now()

    h.lastFailAt = now
    h.totalFails++
    h.consecutiveFails++
    h.lastError = errorMsg.slice(0, 200)

    if (h.state === CircuitState.HALF_OPEN) {
      // Probe failed → reopen
      h.state = CircuitState.OPEN
      h.cooldownUntil = now + computeCooldown(h.consecutiveFails)
      this.halfOpenCounters.delete(key)
      return
    }

    if (h.consecutiveFails >= FAILURE_THRESHOLD) {
      h.state = CircuitState.OPEN
      h.cooldownUntil = now + computeCooldown(h.consecutiveFails)
    }
  }

  /** Record an invalid/empty response (counts as soft failure). */
  recordInvalidResponse(providerId: string, capability: string, reason = 'invalid_response'): void {
    const key = makeKey(providerId, capability)
    const h = this.getOrCreate(key)
    const now = Date.now()

    h.totalFails++
    h.consecutiveFails++
    h.lastFailAt = now
    h.lastError = reason.slice(0, 200)

    if (h.state === CircuitState.HALF_OPEN) {
      h.state = CircuitState.OPEN
      h.cooldownUntil = now + computeCooldown(h.consecutiveFails)
      this.halfOpenCounters.delete(key)
      return
    }

    if (h.consecutiveFails >= FAILURE_THRESHOLD) {
      h.state = CircuitState.OPEN
      h.cooldownUntil = now + computeCooldown(h.consecutiveFails)
    }
  }

  getHealth(providerId: string, capability: string): InterfaceHealth | undefined {
    return this.store.get(makeKey(providerId, capability))
  }

  getAll(): HealthSnapshot {
    const snap: HealthSnapshot = {}
    for (const [k, v] of this.store) snap[k] = { ...v }
    return snap
  }

  /** Remove stale entries older than STALE_THRESHOLD_MS. */
  prune(): number {
    const now = Date.now()
    let removed = 0
    for (const [k, h] of this.store) {
      const lastActivity = Math.max(h.lastFailAt, h.lastSuccessAt)
      if (lastActivity > 0 && now - lastActivity > STALE_THRESHOLD_MS) {
        this.store.delete(k)
        this.halfOpenCounters.delete(k)
        removed++
      }
    }
    return removed
  }

  /** Reset all health state (for testing or manual recovery). */
  reset(providerId?: string, capability?: string): void {
    if (providerId && capability) {
      const key = makeKey(providerId, capability)
      this.store.delete(key)
      this.halfOpenCounters.delete(key)
    } else if (providerId) {
      for (const k of [...this.store.keys()]) {
        if (k.startsWith(providerId + '::')) {
          this.store.delete(k)
          this.halfOpenCounters.delete(k)
        }
      }
    } else {
      this.store.clear()
      this.halfOpenCounters.clear()
    }
  }

  /** Force-close a circuit (manual recovery). */
  forceClose(providerId: string, capability: string): void {
    const key = makeKey(providerId, capability)
    const h = this.store.get(key)
    if (h) {
      h.state = CircuitState.CLOSED
      h.consecutiveFails = 0
      h.cooldownUntil = 0
      this.halfOpenCounters.delete(key)
    }
  }

  private getOrCreate(key: string): InterfaceHealth {
    let h = this.store.get(key)
    if (!h) {
      h = {
        consecutiveFails: 0,
        totalFails: 0,
        totalSuccesses: 0,
        lastFailAt: 0,
        lastSuccessAt: 0,
        state: CircuitState.CLOSED,
        cooldownUntil: 0,
        lastError: '',
      }
      this.store.set(key, h)
    }
    return h
  }
}

// ── Singleton ──

let shared: ProviderHealthTracker | null = null

export function getProviderHealthTracker(): ProviderHealthTracker {
  if (!shared) shared = new ProviderHealthTracker()
  return shared
}

export function resetProviderHealthTracker(): void {
  shared = null
}
