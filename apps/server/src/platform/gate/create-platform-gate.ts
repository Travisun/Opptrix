import { randomUUID } from 'node:crypto'
import type {
  CapabilityAction,
  CapabilityGate,
  CapabilityObservation,
} from '@opptrix/agent'
import { SystemEvents, type EventDispatcher } from '@opptrix/event-bus'
import type { PackRegistry } from '../packs/types.js'
import { domainPackForToken } from './domain-pack-for-token.js'
import {
  DENIAL_RING_CAP,
  METER_USAGE_DELTA_CAP,
  type AuditEntry,
  type DenialRecord,
  type MeterUsageInput,
  type PlatformGateBundle,
  type PlatformMeter,
} from './types.js'

export type { CapabilityAction, CapabilityGate, CapabilityObservation }
export type {
  AuditEntry,
  DenialRecord,
  MeterUsageInput,
  PlatformGateBundle,
  PlatformMeter,
}
export { DENIAL_RING_CAP, METER_USAGE_DELTA_CAP }

const AUDIT_RING_SIZE = 64

const DEFAULT_PRINCIPAL = { kind: 'system', id: 'platform' } as const

export type CreatePlatformGateOptions = {
  /** Domain pack registry used when packEnforce is on. */
  packs?: PackRegistry
  /**
   * When true, deny tokens whose required domain pack is disabled.
   * Default / unset: OFF — passthrough identical to Wave 3 (never denies).
   */
  packEnforce?: boolean
  /**
   * Soft submit quota (Wave 5). Positive integer = max accepts before
   * `quota_exceeded`. `null` / unset / ≤0 = unlimited (Wave 4 default).
   */
  maxSubmits?: number | null
}

function normalizeMaxSubmits(raw: number | null | undefined): number | null {
  if (raw === undefined || raw === null) return null
  if (!Number.isInteger(raw) || raw <= 0) return null
  return raw
}

/** Sanitize one soft usage delta: ignore non-finite / negative; trunc; clamp. */
function sanitizeUsageDelta(raw: unknown): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw) || raw < 0) return 0
  const n = Math.trunc(raw)
  if (n <= 0) return 0
  return n > METER_USAGE_DELTA_CAP ? METER_USAGE_DELTA_CAP : n
}

/**
 * Platform Gate: meter + audit ring + best-effort `chat.tool.end` emit.
 *
 * Soft quota (when `maxSubmits` is a positive integer): if `submitCount >= max`
 * before processing, deny with `quota_exceeded` (no exec). Checked before pack.
 *
 * When `packEnforce` is OFF (`OPPTRIX_PLATFORM_PACK_ENFORCE=0|false|no`): no pack denies;
 * always runs `exec` unless quota.
 * When ON (SF1 default when env unset): may deny with `denialCode: 'pack_disabled'`
 * before `exec` if the domain pack is off.
 *
 * Clean denies (`pack_disabled`, `quota_exceeded`) bump `denyCount`, not `errorCount`,
 * and push a record onto the recent-denials ring (cap 32).
 * If `exec()` throws: audit is recorded (ok:false), errorCount++, then rethrow —
 * AgentEngine chat abort/error paths stay unchanged.
 *
 * Soft LLM usage (Wave 47A + 48A): `meter.recordUsage` bumps `tokenInTotal` / `tokenOutTotal`
 * (default 0). Chat path wires best-effort via AgentSettings.usageMeter (W48).
 */
export function createPlatformGate(
  events: EventDispatcher,
  opts?: CreatePlatformGateOptions,
): PlatformGateBundle {
  let submitCount = 0
  let errorCount = 0
  let denyCount = 0
  let tokenInTotal = 0
  let tokenOutTotal = 0
  const recent: AuditEntry[] = []
  const recentDenials: DenialRecord[] = []
  const packs = opts?.packs
  const packEnforce = opts?.packEnforce === true
  const maxSubmits = normalizeMaxSubmits(opts?.maxSubmits)

  function pushAudit(entry: AuditEntry): void {
    recent.push(entry)
    if (recent.length > AUDIT_RING_SIZE) {
      recent.splice(0, recent.length - AUDIT_RING_SIZE)
    }
  }

  function pushDenial(denialCode: string, token?: string): void {
    recentDenials.push({
      at: new Date().toISOString(),
      denialCode,
      ...(token !== undefined && token !== '' ? { token } : {}),
    })
    while (recentDenials.length > DENIAL_RING_CAP) {
      recentDenials.shift()
    }
  }

  function emitToolEnd(auditId: string, token: string, action: CapabilityAction): void {
    try {
      const principal = action.principal ?? { ...DEFAULT_PRINCIPAL }
      events.emit(SystemEvents.chat.toolEnd, {
        auditId,
        token,
        principal,
      })
    } catch {
      // best-effort — never fail the tool path on bus errors
    }
  }

  function denyObservation(
    action: CapabilityAction,
    denialCode: string,
    message: string,
  ): CapabilityObservation {
    submitCount += 1
    denyCount += 1
    const auditId = randomUUID()
    const durationMs = 0
    pushAudit({
      auditId,
      token: action.token,
      at: new Date().toISOString(),
      ok: false,
      durationMs,
    })
    pushDenial(denialCode, action.token)
    emitToolEnd(auditId, action.token, action)
    return {
      ok: false,
      denialCode,
      auditId,
      message,
    }
  }

  const meter: PlatformMeter = {
    snapshot() {
      return {
        submitCount,
        errorCount,
        denyCount,
        recent: recent.map((e) => ({ ...e })),
        recentDenialCount: recentDenials.length,
        tokenInTotal,
        tokenOutTotal,
      }
    },
    listRecentDenials() {
      return recentDenials.map((r) => ({ ...r }))
    },
    recordUsage(usage: MeterUsageInput): void {
      try {
        tokenInTotal += sanitizeUsageDelta(usage?.tokenIn)
        tokenOutTotal += sanitizeUsageDelta(usage?.tokenOut)
      } catch {
        // soft — never fail callers
      }
    },
  }

  const gate: CapabilityGate = {
    async submit(action, exec): Promise<CapabilityObservation> {
      // Quota first (resource limit before pack policy).
      if (maxSubmits !== null && submitCount >= maxSubmits) {
        return denyObservation(
          action,
          'quota_exceeded',
          `Platform gate submit quota exceeded (max ${maxSubmits})`,
        )
      }

      submitCount += 1
      const auditId = randomUUID()
      const started = Date.now()

      if (packEnforce && packs) {
        const packId = domainPackForToken(action.token)
        if (packId !== null && !packs.isEnabled(packId)) {
          denyCount += 1
          const durationMs = Date.now() - started
          pushAudit({
            auditId,
            token: action.token,
            at: new Date().toISOString(),
            ok: false,
            durationMs,
          })
          pushDenial('pack_disabled', action.token)
          emitToolEnd(auditId, action.token, action)
          return {
            ok: false,
            denialCode: 'pack_disabled',
            auditId,
            message: `Domain pack '${packId}' is disabled`,
          }
        }
      }

      try {
        const data = await exec()
        const durationMs = Date.now() - started
        pushAudit({
          auditId,
          token: action.token,
          at: new Date().toISOString(),
          ok: true,
          durationMs,
        })
        emitToolEnd(auditId, action.token, action)
        return { ok: true, data, auditId }
      } catch (err) {
        const durationMs = Date.now() - started
        errorCount += 1
        pushAudit({
          auditId,
          token: action.token,
          at: new Date().toISOString(),
          ok: false,
          durationMs,
        })
        throw err
      }
    },
  }

  return { gate, meter }
}
