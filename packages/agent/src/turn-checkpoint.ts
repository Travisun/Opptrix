/**
 * Optional port: mirror chat turn persistence onto a platform CheckpointStore.
 * When unset, AgentEngine behaviour is unchanged.
 *
 * Wave 51A: optional hard-restore apply (metadata + optional turn truncate).
 * Wave 52A: bounded turns snapshot in payload; hard restore prefers turns over truncate.
 */

export type TurnCheckpointPhase = 'user' | 'assistant'

/** Max turns kept in a checkpoint payload (newest last). */
export const CHECKPOINT_TURNS_CAP = 32

/** Max UTF-16 code units of content per turn in checkpoint payload. */
export const CHECKPOINT_TURN_CONTENT_MAX = 8 * 1024

/** Lightweight turn slice stored in checkpoint payload (no tools/attachments). */
export type CheckpointTurnSlice = {
  role: string
  content: string
  at?: string
}

export type TurnCheckpointSnapshot = {
  phase: TurnCheckpointPhase
  sessionId: string
  title?: string
  model?: string
  messageCount: number
  turnCount: number
  at: string
  /** Bounded transcript snapshot (Wave 52); omit when session has no turns. */
  turns?: CheckpointTurnSlice[]
}

export type TurnCheckpointHooks = {
  save(snapshot: TurnCheckpointSnapshot): void
}

/** Input for hard checkpoint restore into SessionStore (Wave 51+). */
export type CheckpointApplyInput = {
  sessionId: string
  title?: string
  model?: string
  /**
   * If set and session turnCount > this, truncate turns/messages to this length
   * (destructive). Ignored when `turns` is present (Wave 52 precedence).
   */
  turnCount?: number
  /**
   * When present (including empty array), replace session turns/messages from
   * this sanitized snapshot instead of turnCount truncate.
   */
  turns?: CheckpointTurnSlice[]
}

export type CheckpointApplyHooks = {
  apply(
    input: CheckpointApplyInput,
  ): { ok: true; truncated: boolean } | { ok: false; error: string }
}

type LooseTurn = {
  role?: unknown
  content?: unknown
  at?: unknown
}

/**
 * Cap + strip heavy fields for checkpoint payload / apply input.
 * Keeps only user|assistant with truncated content; drops tools/attachments.
 */
export function boundCheckpointTurns(
  turns: readonly LooseTurn[] | null | undefined,
): CheckpointTurnSlice[] | undefined {
  if (!turns || turns.length === 0) return undefined
  const sliced = turns.length > CHECKPOINT_TURNS_CAP
    ? turns.slice(-CHECKPOINT_TURNS_CAP)
    : turns
  const out: CheckpointTurnSlice[] = []
  for (const raw of sliced) {
    if (!raw || typeof raw !== 'object') continue
    const role = typeof raw.role === 'string' ? raw.role.trim() : ''
    if (role !== 'user' && role !== 'assistant') continue
    let content = typeof raw.content === 'string' ? raw.content : ''
    if (content.length > CHECKPOINT_TURN_CONTENT_MAX) {
      content = content.slice(0, CHECKPOINT_TURN_CONTENT_MAX)
    }
    const item: CheckpointTurnSlice = { role, content }
    if (typeof raw.at === 'string' && raw.at.trim()) {
      item.at = raw.at
    }
    out.push(item)
  }
  return out.length > 0 ? out : undefined
}

/**
 * Sanitize apply/payload turns array (empty input → empty output).
 * Always returns an array when called with an array.
 */
export function sanitizeCheckpointTurnsForApply(
  turns: readonly LooseTurn[],
): CheckpointTurnSlice[] {
  return boundCheckpointTurns(turns) ?? []
}
