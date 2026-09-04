import { randomUUID } from 'node:crypto'

/** Action submitted to the capability Gate (K2: tool name as token). */
export type CapabilityAction = {
  token: string
  method?: string
  args: Record<string, unknown>
  principal?: { kind: string; id?: string; sessionId?: string }
  traceId?: string
}

/** Observation returned by the Gate after exec (passthrough keeps tool semantics). */
export type CapabilityObservation = {
  ok: boolean
  data?: unknown
  denialCode?: string
  auditId: string
  message?: string
}

export type CapabilityGate = {
  submit(action: CapabilityAction, exec: () => Promise<unknown>): Promise<CapabilityObservation>
}

/**
 * Always runs `exec()`, assigns a unique auditId, returns `{ ok: true, data, auditId }`.
 * Tool-level `{ error: string }` payloads stay in `data` — do not flip `ok`.
 */
export function createPassthroughGate(): CapabilityGate {
  return {
    async submit(_action, exec) {
      const auditId = randomUUID()
      const data = await exec()
      return { ok: true, data, auditId }
    },
  }
}

/**
 * Map a Gate observation to the tool-result shape the model sees.
 * Clean denials (`!obs.ok`) become `{ error, denialCode? }` — never treat as success payload.
 */
export function toolResultFromGateObservation(obs: CapabilityObservation): unknown {
  if (!obs.ok) {
    const denialCode = typeof obs.denialCode === 'string' && obs.denialCode.trim()
      ? obs.denialCode.trim()
      : undefined
    const message =
      typeof obs.message === 'string' && obs.message.trim()
        ? obs.message.trim()
        : denialCode
          ? `Capability denied: ${denialCode}`
          : 'Capability denied'
    return denialCode
      ? { error: message, denialCode }
      : { error: message }
  }
  return obs.data
}
