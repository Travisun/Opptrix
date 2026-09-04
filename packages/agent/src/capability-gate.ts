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
