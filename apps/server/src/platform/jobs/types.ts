/** K3 thin Jobs facade — unified read + cancel across existing backends. */

export type PlatformJobSnapshot = {
  id: string
  /** e.g. 'agent.shell-command' | 'discover' | 'schedule.agent_chat' | 'shell.*' */
  kind: string
  status: string
  label?: string
  updatedAt?: string
  /** Backend id for attribution / cancel routing */
  source: string
}

export type JobsFacade = {
  list(): PlatformJobSnapshot[]
  /** Try known backends in order; true if any cancelled. */
  cancel(jobId: string): boolean
}

/** Injectable backends — production defaults wrap existing APIs; tests pass mocks. */
export type JobsFacadeBackend = {
  list(): PlatformJobSnapshot[]
  cancel(jobId: string): boolean
}
