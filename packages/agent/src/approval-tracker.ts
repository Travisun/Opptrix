/**
 * Optional port: mirror UserPromptBridge lifecycle onto a platform ApprovalQueue.
 * When unset, AgentEngine behaviour is unchanged (bridge-only).
 *
 * Ownership (Wave 56):
 * - `platform.approval` is the **primary** ask_user record (kind `'ask_user'`, id ≡ promptId).
 * - `UserPromptBridge` remains the waiter/transport only — do not delete.
 *
 * Resolve either side completes the wait:
 * - Wave 7: UserPrompt resolve → ApprovalTracker.resolve (prompt→approval).
 * - Wave 50: platform.approval.resolve → UserPromptBridge.submit (approval→prompt, soft).
 */

import { createUserPromptId, type UserPromptAnswer } from './user-prompt.js'

export type ApprovalTracker = {
  /**
   * Register a pending ApprovalRequest before bridge wait (Wave 56 primary path).
   * `id` is both `approval.id` and UserPromptBridge `promptId`.
   */
  track(input: {
    id: string
    sessionId: string
    kind: string
    title?: string
  }): void
  resolve(id: string, decision: { approved: boolean; note?: string }): void
  cancelSession(sessionId: string): void
}

/**
 * Wave 56: allocate prompt id, create pending approval (when tracker bound), return id for bridge.
 * Always call **before** `UserPromptBridge.waitForAnswer`. Default kind is `'ask_user'`.
 */
export function allocateApprovalOwnedPromptId(
  tracker: ApprovalTracker | undefined,
  input: {
    sessionId: string
    kind?: string
    title?: string
    id?: string
  },
): string {
  const custom =
    typeof input.id === 'string' ? input.id.trim() : ''
  const id = custom || createUserPromptId()
  const kindRaw =
    typeof input.kind === 'string' ? input.kind.trim() : ''
  const kind = kindRaw || 'ask_user'
  if (tracker) {
    try {
      const payload: {
        id: string
        sessionId: string
        kind: string
        title?: string
      } = {
        id,
        sessionId: input.sessionId,
        kind,
      }
      if (typeof input.title === 'string' && input.title.trim()) {
        payload.title = input.title.trim()
      }
      tracker.track(payload)
    } catch {
      /* swallow — approval must never break chat */
    }
  }
  return id
}

/** Best-effort approved flag from UserPromptAnswer (reject/cancel/cancelled → false). */
export function deriveApprovedFromUserPromptAnswer(answer: {
  cancelled?: boolean
  selected_ids?: string[]
}): boolean {
  if (answer.cancelled === true) return false
  const ids = answer.selected_ids ?? []
  if (ids.includes('reject') || ids.includes('cancel')) return false
  return true
}

/**
 * Map ApprovalDecision → UserPromptAnswer for soft approval→prompt resolve (Wave 50A).
 * Inverse of deriveApprovedFromUserPromptAnswer for the approve/reject axis; note → custom_text.
 */
export function userPromptAnswerFromApprovalDecision(decision: {
  approved: boolean
  note?: string
}): UserPromptAnswer {
  const note =
    typeof decision.note === 'string' && decision.note.trim()
      ? decision.note.trim()
      : undefined
  if (decision.approved === true) {
    if (note) {
      return {
        kind: 'custom',
        selected_ids: [],
        selected_labels: [],
        custom_text: note,
      }
    }
    return {
      kind: 'option',
      selected_ids: ['approve'],
      selected_labels: ['同意'],
    }
  }
  if (note) {
    return {
      kind: 'custom',
      selected_ids: ['reject'],
      selected_labels: ['拒绝'],
      custom_text: note,
    }
  }
  return {
    kind: 'option',
    selected_ids: ['reject'],
    selected_labels: ['拒绝'],
  }
}
