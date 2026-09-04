/**
 * @deprecated SF-thin-A: grant file overwrite/delete no longer use Hands confirm.
 * Helper kept for tests / potential non-file sticky UX; do not wire from index.ts.
 *
 * Hands destructive confirm → ask_user-style UserPrompt (click OK, not TOTP).
 * Session id is supplied via AsyncLocalStorage from HandsPort defaultWorkspace.
 */
import { AsyncLocalStorage } from 'node:async_hooks'
import {
  UserPromptCancelledError,
  type UserPromptAnswer,
  type UserPromptPayload,
} from '@opptrix/agent'
import type { ConfirmHandler } from '@opptrix/agent-workspace'
import type { ApprovalQueue } from '../approval/types.js'

const handsConfirmSessionAls = new AsyncLocalStorage<string>()

/** Run workspace write/delete confirm under the Hands ticket session. */
export function runWithHandsConfirmSession<T>(
  sessionId: string,
  fn: () => T,
): T {
  return handsConfirmSessionAls.run(sessionId, fn)
}

export type HandsConfirmPushPayload = UserPromptPayload

export type CreateHandsConfirmHandlerDeps = {
  pushUserPrompt: (sessionId: string, payload: HandsConfirmPushPayload) => void
  waitForAnswer: (
    sessionId: string,
    promptId: string,
    signal?: AbortSignal,
  ) => Promise<UserPromptAnswer>
  allocatePromptId: () => string
  /** Optional: mirror to platform.approval for diagnostics (id ≡ promptId). */
  approval?: ApprovalQueue
}

function isUserPromptCancelled(err: unknown): boolean {
  if (err instanceof UserPromptCancelledError) return true
  return err instanceof Error && err.name === 'UserPromptCancelledError'
}

function answerAllowsOnce(answer: UserPromptAnswer): boolean {
  if (answer.cancelled === true) return false
  const ids = answer.selected_ids ?? []
  if (ids.includes('reject') || ids.includes('cancel')) return false
  return (
    ids.includes('confirm')
    || ids.includes('once')
    || ids.includes('sticky')
    || ids.includes('always')
    || ids.includes('approve')
  )
}

/**
 * ConfirmHandler for Hands overwrite/delete: push confirm-mode UserPrompt, wait, map to sticky once.
 */
export function createHandsConfirmHandler(
  deps: CreateHandsConfirmHandlerDeps,
): ConfirmHandler {
  return async (payload) => {
    const sessionId = handsConfirmSessionAls.getStore()?.trim() ?? ''
    if (!sessionId) {
      return { selected_ids: ['cancel'] }
    }

    const promptId = deps.allocatePromptId()
    const title =
      typeof payload.title === 'string' && payload.title.trim()
        ? payload.title.trim()
        : payload.operation === 'delete'
          ? '确认删除'
          : '确认覆盖'
    const promptText =
      typeof payload.prompt === 'string' && payload.prompt.trim()
        ? payload.prompt.trim()
        : payload.operation === 'delete'
          ? `确定要删除「${payload.path || '/'}」吗？删除后无法恢复。`
          : `文件「${payload.path}」已存在，确定覆盖吗？`

    if (deps.approval) {
      try {
        deps.approval.request({
          id: promptId,
          sessionId,
          kind: 'hands_confirm',
          title,
          meta: {
            operation: payload.operation,
            root_id: payload.root_id,
            path: payload.path,
            promptId,
          },
        })
      } catch {
        /* diagnostics must never break Hands */
      }
    }

    const pushPayload: HandsConfirmPushPayload = {
      id: promptId,
      title,
      prompt: promptText,
      options: [],
      mode: 'confirm',
      allow_custom: false,
      confirm_label: '确认',
      reject_label: '取消',
    }
    deps.pushUserPrompt(sessionId, pushPayload)

    try {
      const answer = await deps.waitForAnswer(sessionId, promptId)
      if (answerAllowsOnce(answer)) {
        return { selected_ids: ['once'] }
      }
      return { selected_ids: ['cancel'] }
    } catch (err) {
      if (isUserPromptCancelled(err)) {
        return { selected_ids: ['cancel'] }
      }
      throw err
    }
  }
}
