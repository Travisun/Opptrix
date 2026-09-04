/**
 * Optional port: mirror LLM turn token usage onto a platform Meter.
 * When unset, AgentEngine behaviour is unchanged.
 */

export type UsageMeterRecordInput = {
  tokenIn?: number
  tokenOut?: number
  sessionId?: string
}

export type UsageMeterHooks = {
  record(usage: UsageMeterRecordInput): void
}
