import type { CheckpointLatest } from './types.js'
import type { PlatformContext } from '../types.js'
import {
  sanitizeCheckpointTurnsForApply,
  type CheckpointTurnSlice,
} from '@opptrix/agent'

const SOFT_RESTORE_NOTE = 'soft_restore_no_engine_apply' as const
const HARD_RESTORE_NOTE = 'hard_restore_metadata_applied' as const
const APPLY_NOT_WIRED = 'checkpoint apply not wired' as const
const CONFIRM_REQUIRED = 'confirm_required' as const

function asPayload(raw: unknown): Record<string, unknown> | null {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return null
  return { ...(raw as Record<string, unknown>) }
}

function payloadApplyFields(payload: Record<string, unknown>): {
  title?: string
  model?: string
  turnCount?: number
  turns?: CheckpointTurnSlice[]
} {
  const out: {
    title?: string
    model?: string
    turnCount?: number
    turns?: CheckpointTurnSlice[]
  } = {}
  if (typeof payload.title === 'string') out.title = payload.title
  if (typeof payload.model === 'string') out.model = payload.model
  if (typeof payload.turnCount === 'number' && Number.isFinite(payload.turnCount)) {
    out.turnCount = payload.turnCount
  }
  if (Array.isArray(payload.turns)) {
    out.turns = sanitizeCheckpointTurnsForApply(
      payload.turns as Array<{ role?: unknown; content?: unknown; at?: unknown }>,
    )
  }
  return out
}

export type AdmitCheckpointRestoreOk = {
  ok: true
  traceId: string
  origin: string
  checkpoint: CheckpointLatest | null
  applied: boolean
  truncated?: boolean
  note: string
}

/**
 * Soft restore (default): Ingress admit → load checkpoint payload (get or latest).
 * Hard restore (`apply: true`): requires explicit `confirm: true`; mutates SessionStore
 * via bound checkpointApply hook (title/model + turns snapshot when present, else
 * optional turn truncate). Without confirm → `confirm_required`, no apply.
 */
export function admitCheckpointRestore(
  platform: Pick<PlatformContext, 'ingress' | 'checkpoint' | 'checkpointApply'>,
  input: {
    sessionId: string
    checkpointId?: string
    apply?: boolean
    /** Required when `apply: true` (C3 hard-restore confirm). */
    confirm?: boolean
  },
  opts?: { origin?: string },
): AdmitCheckpointRestoreOk | { ok: false; error: string } {
  const sid = typeof input.sessionId === 'string' ? input.sessionId.trim() : ''
  if (!sid) {
    return { ok: false, error: 'sessionId required' }
  }

  const wantApply = input.apply === true

  // C3: hard restore is destructive — require explicit confirm before any apply.
  if (wantApply && input.confirm !== true) {
    return { ok: false, error: CONFIRM_REQUIRED }
  }

  if (wantApply && !platform.checkpointApply) {
    return { ok: false, error: APPLY_NOT_WIRED }
  }

  const admitted = platform.ingress.admit(opts?.origin ?? 'web.diagnostic', {
    text: 'platform.checkpoint.restore',
    sessionId: sid,
  })
  if (!admitted.ok) {
    return { ok: false, error: admitted.error }
  }

  const checkpointId =
    typeof input.checkpointId === 'string' ? input.checkpointId.trim() : ''

  let checkpoint: CheckpointLatest | null = null

  if (checkpointId) {
    const row = platform.checkpoint.list(sid).find((item) => item.id === checkpointId)
    if (row) {
      const payload = asPayload(platform.checkpoint.get(checkpointId))
      if (payload) {
        checkpoint = { id: row.id, at: row.at, payload }
      }
    } else if (platform.checkpoint.get(checkpointId) != null) {
      return { ok: false, error: 'checkpoint does not belong to session' }
    }
  } else {
    checkpoint = platform.checkpoint.latest(sid)
  }

  if (!wantApply) {
    return {
      ok: true,
      traceId: admitted.envelope.traceId,
      origin: admitted.envelope.origin,
      checkpoint,
      applied: false,
      note: SOFT_RESTORE_NOTE,
    }
  }

  if (!checkpoint) {
    return { ok: false, error: 'checkpoint not found' }
  }

  const hooks = platform.checkpointApply
  if (!hooks) {
    return { ok: false, error: APPLY_NOT_WIRED }
  }

  const fields = payloadApplyFields(checkpoint.payload)
  let appliedResult: { ok: true; truncated: boolean } | { ok: false; error: string }
  try {
    appliedResult = hooks.apply({
      sessionId: sid,
      ...fields,
    })
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'checkpoint apply failed',
    }
  }

  if (!appliedResult.ok) {
    return { ok: false, error: appliedResult.error }
  }

  return {
    ok: true,
    traceId: admitted.envelope.traceId,
    origin: admitted.envelope.origin,
    checkpoint,
    applied: true,
    truncated: appliedResult.truncated,
    note: HARD_RESTORE_NOTE,
  }
}
