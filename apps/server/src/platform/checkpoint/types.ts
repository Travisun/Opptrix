/** In-memory checkpoint stub — Wave 3. Cap 32 per session. Wave 16A: latest(). */

export type CheckpointListItem = {
  id: string
  at: string
}

/** Newest checkpoint for a session (id + at + payload copy). */
export type CheckpointLatest = {
  id: string
  at: string
  payload: Record<string, unknown>
}

export type CheckpointStore = {
  save(sessionId: string, payload: Record<string, unknown>): { id: string }
  list(sessionId: string): CheckpointListItem[]
  /** Payload copy only; null if missing. */
  get(id: string): unknown | null
  /**
   * Newest checkpoint for session (last in order), or null if empty / blank sessionId.
   * Returns id + at + payload copy — does not auto-restore into AgentEngine/chat.
   */
  latest(sessionId: string): CheckpointLatest | null
}
