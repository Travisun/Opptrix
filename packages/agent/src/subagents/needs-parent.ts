/**
 * 子缺确认权 → 标记 run 为 needs_parent_action，并可选通知父会话。
 */

import { getSessionResumeBus } from '../jobs/resume-bus.js'
import type { SubagentRun } from './types.js'
import { getSubagentRunRegistry, type SubagentRunRegistry } from './registry.js'

export type NeedsParentActionPayload = NonNullable<SubagentRun['needsParentAction']>

/**
 * 将 child 对应的 running/queued run 标为 needs_parent_action。
 * @returns 更新后的 run；找不到或非运行态则 null
 */
export function markRunNeedsParentAction(
  childSessionId: string,
  needsParentAction: NeedsParentActionPayload,
  opts?: {
    parentSessionId?: string
    registry?: SubagentRunRegistry
    /** background 时经 SessionResumeBus 提醒父 */
    notifyParent?: boolean
  },
): SubagentRun | null {
  const registry = opts?.registry ?? getSubagentRunRegistry()
  const run = registry.findByChildSessionId(childSessionId, opts?.parentSessionId)
  if (!run) return null
  if (run.status !== 'running' && run.status !== 'queued' && run.status !== 'needs_parent_action') {
    return null
  }
  const updated = registry.setStatus(run.id, 'needs_parent_action', {
    needsParentAction,
    error: needsParentAction.message,
  })
  if (updated && opts?.notifyParent !== false && updated.mode === 'background') {
    notifyParentOnNeedsParentAction(updated)
  }
  return updated
}

function notifyParentOnNeedsParentAction(run: SubagentRun): void {
  const label = (run.label || '协作任务').trim() || '协作任务'
  const message = (run.needsParentAction?.message ?? run.error ?? '').trim() || '需要你确认或授权后继续'
  const prompt = [
    `协作任务「${label}」需要你处理。`,
    `状态：needs_parent_action`,
    `说明：${message}`,
    `run_id: ${run.id}`,
    '',
    '请确认或授权后，再决定是否继续该协作任务。需要详情时调用一次 get_subagent；勿 poll / sleep / 反复查进度。失败后可再 run_subagent。',
  ].join('\n')
  getSessionResumeBus().enqueue({
    sessionId: run.parentSessionId,
    cause: 'subagent_terminal',
    jobId: run.id,
    prompt,
  })
}
