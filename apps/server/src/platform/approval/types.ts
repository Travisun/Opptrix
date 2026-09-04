/** In-memory approval queue — Wave 6A (K6 minimal). Cap 64 pending globally. */

export type ApprovalStatus = 'pending' | 'resolved' | 'cancelled'

export type ApprovalDecision = {
  approved: boolean
  note?: string
}

export type ApprovalRequest = {
  id: string
  sessionId: string
  kind: string
  title?: string
  meta?: Record<string, unknown>
  status: ApprovalStatus
  createdAt: string
  decision?: ApprovalDecision
  resolvedAt?: string
}

export type ApprovalRequestInput = {
  sessionId: string
  kind: string
  title?: string
  meta?: Record<string, unknown>
  /** Optional fixed id (e.g. UserPrompt mirror). Trimmed non-empty; duplicates rejected. */
  id?: string
}

export type ApprovalRequestResult =
  | { ok: true; id: string }
  | { ok: false; error: string }

/** Soft UserPrompt mirror after pending→resolved (Wave 50A). Fail-open. */
export type ApprovalUserPromptResolveHandler = (input: {
  id: string
  sessionId: string
  decision: ApprovalDecision
}) => void

export type ApprovalQueue = {
  request(input: ApprovalRequestInput): ApprovalRequestResult
  /** Pending only; optional session filter. */
  list(sessionId?: string): ApprovalRequest[]
  /** False if missing or already resolved/cancelled. */
  resolve(id: string, decision: { approved: boolean; note?: string }): boolean
  /** Cancel pending for session; returns count cancelled. */
  cancelSession(sessionId: string): number
  /**
   * Late-bind soft UserPrompt resolve (approval id ≡ promptId, Wave 7 mirror reverse).
   * Invoked only after a successful pending→resolved transition; errors swallowed by queue.
   */
  bindUserPromptResolve(handler: ApprovalUserPromptResolveHandler | null): void
}
