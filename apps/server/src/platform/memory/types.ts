/** Platform Memory facade — Wave 12A (working get + durable promote w/ provenance). */

export type MemoryWorkingSnapshot = {
  goal: string
  entities: string
  facts: string
  workingState: string
  updatedAt: string
  compactVersion: number
  sourceMessageCount: number
  /** true if any meaningful field non-empty */
  nonEmpty: boolean
}

export type MemoryProvenance = {
  source: string // required non-empty
  at?: string
  ref?: string
}

export type DurableMemoryEntry = {
  id: string
  sessionId: string
  kind: string
  content: string
  provenance: MemoryProvenance
  createdAt: string
}

export type MemoryFacade = {
  /** Late-bind reader from AgentEngine sessions (call after agent constructed). */
  bindWorkingSource(
    reader: (sessionId: string) => MemoryWorkingSnapshot | null | unknown,
  ): void
  getWorking(sessionId: string): MemoryWorkingSnapshot | null
  promote(input: {
    sessionId: string
    kind: string
    content: string
    provenance?: MemoryProvenance | null
  }): { ok: true; id: string } | { ok: false; error: string; denialCode?: string }
  listDurable(sessionId?: string): DurableMemoryEntry[]
}
