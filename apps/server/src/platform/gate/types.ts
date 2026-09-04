/** Gate audit meter — Wave 2; recent-denials ring — Wave 33A; soft LLM usage — Wave 47A; chat wire — Wave 48A. */

export type AuditEntry = {
  auditId: string
  token: string
  at: string
  ok: boolean
  durationMs: number
}

/** Cap for in-memory gate denial observability ring (newest last). */
export const DENIAL_RING_CAP = 32

/**
 * Soft clamp for a single `recordUsage` delta (tokenIn / tokenOut).
 * Larger values are truncated to this; negatives / NaN are ignored.
 */
export const METER_USAGE_DELTA_CAP = 1_000_000

/** Observability record for a clean gate deny (quota / pack / …). */
export type DenialRecord = {
  at: string
  denialCode: string
  token?: string
}

/** Soft LLM token usage delta — additive; defaults omitted = no-op for that field. */
export type MeterUsageInput = {
  tokenIn?: number
  tokenOut?: number
  /** Reserved for later per-session wiring; ignored by soft totals. */
  sessionId?: string
}

export type PlatformMeter = {
  snapshot(): {
    submitCount: number
    errorCount: number
    /** Clean denies only (`pack_disabled`, `quota_exceeded`) — not exec throws. */
    denyCount: number
    recent: AuditEntry[]
    /** Length of recent-denials ring (cap DENIAL_RING_CAP). */
    recentDenialCount: number
    /** Soft cumulative prompt/input tokens (default 0 until wired). */
    tokenInTotal: number
    /** Soft cumulative completion/output tokens (default 0 until wired). */
    tokenOutTotal: number
  }
  /** Recent clean denies; newest last; max DENIAL_RING_CAP. */
  listRecentDenials(): DenialRecord[]
  /**
   * Best-effort soft counter bump. Ignores negative/NaN; truncates;
   * clamps each field add to METER_USAGE_DELTA_CAP. Never throws.
   */
  recordUsage(usage: MeterUsageInput): void
}

export type PlatformGateBundle = {
  gate: import('@opptrix/agent').CapabilityGate
  meter: PlatformMeter
}
