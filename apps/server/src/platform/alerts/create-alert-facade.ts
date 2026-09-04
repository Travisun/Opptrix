import { randomUUID } from 'node:crypto'
import { SystemEvents, type EventDispatcher, type EventEnvelope } from '@opptrix/event-bus'
import type { AlertFacade, PlatformAlert } from './types.js'

/** Cap for in-memory alert ring (newest last; drop oldest). */
export const ALERT_RING_CAP = 64

export type CreateAlertFacadeOptions = {
  /** When set, subscribe to job.terminal (+ extension.crashed) and push alerts. */
  events?: EventDispatcher
}

function asString(value: unknown, fallback = ''): string {
  if (typeof value === 'string') return value
  if (value == null) return fallback
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return fallback
}

function asPayload(raw: unknown): Record<string, unknown> {
  if (raw !== null && typeof raw === 'object' && !Array.isArray(raw)) {
    return { ...(raw as Record<string, unknown>) }
  }
  if (raw === undefined) return {}
  return { value: raw }
}

function cloneAlert(a: PlatformAlert): PlatformAlert {
  return {
    id: a.id,
    at: a.at,
    kind: a.kind,
    title: a.title,
    payload: { ...a.payload },
    acknowledged: a.acknowledged,
  }
}

/**
 * In-memory AlertFacade: EventBus → ring (cap 64).
 * Listener is soft — never throws into the bus.
 */
export function createAlertFacade(opts?: CreateAlertFacadeOptions): AlertFacade {
  const ring: PlatformAlert[] = []

  function pushInternal(input: {
    id?: string
    at?: string
    kind: string
    title: string
    payload: Record<string, unknown>
    acknowledged?: boolean
  }): string {
    const id = (input.id?.trim() || randomUUID()).trim() || randomUUID()
    const alert: PlatformAlert = {
      id,
      at: input.at?.trim() || new Date().toISOString(),
      kind: String(input.kind ?? '').trim() || 'unknown',
      title: String(input.title ?? '').trim() || input.kind,
      payload: { ...input.payload },
      acknowledged: input.acknowledged === true,
    }
    ring.push(alert)
    while (ring.length > ALERT_RING_CAP) {
      ring.shift()
    }
    return id
  }

  function handleEnvelope(envelope: EventEnvelope): void {
    try {
      const name = envelope.name
      if (name === SystemEvents.job.terminal) {
        const payload = asPayload(envelope.payload)
        const jobId = asString(payload.jobId, 'unknown')
        const status = asString(payload.status, 'terminal')
        pushInternal({
          kind: 'job.terminal',
          title: `Job ${jobId} ${status}`,
          payload,
          at: envelope.timestamp,
        })
        return
      }
      if (name === SystemEvents.extension.crashed) {
        const payload = asPayload(envelope.payload)
        const extId =
          asString(payload.extensionId) ||
          asString(payload.id) ||
          asString(payload.pluginId) ||
          'unknown'
        pushInternal({
          kind: 'extension.crashed',
          title: `Extension ${extId} crashed`,
          payload,
          at: envelope.timestamp,
        })
      }
    } catch {
      // soft — never fail the bus path
    }
  }

  if (opts?.events) {
    try {
      opts.events.subscribe(handleEnvelope)
    } catch {
      // soft — facade still usable without live wiring
    }
  }

  return {
    list(listOpts) {
      const includeAck = listOpts?.includeAcknowledged !== false
      let rows = includeAck ? ring : ring.filter((a) => !a.acknowledged)
      const limit = listOpts?.limit
      if (typeof limit === 'number' && Number.isFinite(limit) && limit >= 0) {
        const n = Math.trunc(limit)
        if (rows.length > n) {
          rows = rows.slice(rows.length - n)
        }
      }
      return rows.map(cloneAlert)
    },

    acknowledge(id) {
      const key = String(id ?? '').trim()
      if (!key) return false
      const hit = ring.find((a) => a.id === key)
      if (!hit) return false
      if (hit.acknowledged) return true
      hit.acknowledged = true
      return true
    },

    clear() {
      ring.length = 0
    },

    pushForTests(alert) {
      return pushInternal({
        id: alert.id,
        at: alert.at,
        kind: alert.kind,
        title: alert.title,
        payload: asPayload(alert.payload),
        acknowledged: alert.acknowledged,
      })
    },
  }
}
