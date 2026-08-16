/**
 * 删父级联：先 cancel 运行中子，再删 child session 与 run 记录。
 */

import type { SubagentRunRegistry } from './registry.js'
import { getSubagentRunRegistry } from './registry.js'
import { notifyParentOnBackgroundTerminal } from './runner.js'

export interface CascadeDeleteHost {
  /** 取消子 chat / abort */
  cancelChildChat?: (childSessionId: string) => void
  /** 删除子会话（引擎旁路：workspace/attachments 等） */
  deleteChildSession: (childSessionId: string) => void
}

/**
 * 级联清理 parent 下所有 subagent runs。
 * @returns 删除的 run 数量
 */
export function cascadeDeleteSubagents(
  parentSessionId: string,
  host: CascadeDeleteHost,
  registry: SubagentRunRegistry = getSubagentRunRegistry(),
): number {
  const runs = registry.listByParent(parentSessionId)
  for (const run of runs) {
    if (run.status === 'running' || run.status === 'queued') {
      host.cancelChildChat?.(run.childSessionId)
      registry.setStatus(run.id, 'cancelled', {
        finishedAt: new Date().toISOString(),
        error: '父会话已删除',
      })
    }
    try {
      host.deleteChildSession(run.childSessionId)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.warn(`[subagent] 删除子会话失败 (${run.childSessionId}): ${msg}`)
    }
    registry.delete(run.id)
  }
  return runs.length
}

/**
 * Stop 父：取消所有仍在 running/queued 的子（不删 session）。
 * 终态会 emit（若提供）并经 ResumeBus 通知 background 父会话。
 */
export function cancelRunningSubagentsForParent(
  parentSessionId: string,
  host: Pick<CascadeDeleteHost, 'cancelChildChat'> & {
    emit?: (event: import('../chat-progress.js').ChatProgressEvent) => void
  },
  registry: SubagentRunRegistry = getSubagentRunRegistry(),
): number {
  const running = registry.listRunningByParent(parentSessionId)
  for (const run of running) {
    host.cancelChildChat?.(run.childSessionId)
    registry.setStatus(run.id, 'cancelled', {
      finishedAt: new Date().toISOString(),
      error: '父会话已停止',
    })
    const cancelled = registry.get(run.id)
    if (cancelled) {
      host.emit?.({
        type: 'subagent_done',
        run_id: cancelled.id,
        label: cancelled.label,
        status: cancelled.status,
        child_session_id: cancelled.childSessionId,
        mode: cancelled.mode,
        summary: cancelled.summary ?? cancelled.error ?? '已停止',
      })
      notifyParentOnBackgroundTerminal(cancelled)
    }
  }
  return running.length
}
