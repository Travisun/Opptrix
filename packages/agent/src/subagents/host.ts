/**
 * 工具侧 Subagent Host 桥 — 由 AgentEngine 在 chat 时绑定，避免 ToolRegistry↔Engine 循环依赖。
 */

import type { ChatProgressEvent } from '../chat-progress.js'
import type { SubagentResultSchema, SubagentRole, SubagentRunMode, SubagentToolResult } from './types.js'
import {
  cancelSubagentRun,
  getSubagentRunResult,
  listSubagentRunsForParent,
  reclaimSubagentRun,
  runSubagent,
  type SubagentRunnerHost,
} from './runner.js'

export interface BoundSubagentHost {
  parentSessionId: string
  runnerHost: SubagentRunnerHost
  emit?: (event: ChatProgressEvent) => void
  signal?: AbortSignal
  gen: number
}

let genSeq = 0
const hostsBySession = new Map<string, BoundSubagentHost>()

export function bindSubagentHost(next: Omit<BoundSubagentHost, 'gen'>): number {
  const gen = ++genSeq
  hostsBySession.set(next.parentSessionId, { ...next, gen })
  return gen
}

export function unbindSubagentHost(parentSessionId: string, gen: number): void {
  const cur = hostsBySession.get(parentSessionId)
  if (cur && cur.gen === gen) {
    hostsBySession.delete(parentSessionId)
  }
}

export function getBoundSubagentHost(parentSessionId: string): BoundSubagentHost | null {
  return hostsBySession.get(parentSessionId) ?? null
}

export async function hostRunSubagent(
  parentSessionId: string,
  args: {
    role: SubagentRole
    task: string
    context?: string
    result_schema: SubagentResultSchema
    mode?: SubagentRunMode
    label?: string
  },
): Promise<SubagentToolResult> {
  const bound = hostsBySession.get(parentSessionId)
  if (!bound) {
    return {
      ok: false,
      run_id: '',
      status: 'failed',
      error: 'run_subagent 须在父会话聊天上下文中调用',
    }
  }
  return runSubagent(bound.runnerHost, {
    parentSessionId,
    role: args.role,
    task: args.task,
    context: args.context,
    result_schema: args.result_schema,
    mode: args.mode,
    label: args.label,
    emit: bound.emit,
    signal: bound.signal,
  })
}

export async function hostCancelSubagent(
  parentSessionId: string,
  runId: string,
): Promise<SubagentToolResult> {
  const bound = hostsBySession.get(parentSessionId)
  if (!bound) {
    return {
      ok: false,
      run_id: runId,
      status: 'failed',
      error: 'cancel_subagent 须在父会话聊天上下文中调用',
    }
  }
  return cancelSubagentRun(runId, bound.runnerHost)
}

export function hostListSubagents(parentSessionId: string): {
  ok: boolean
  runs: ReturnType<typeof listSubagentRunsForParent>
  error?: string
} {
  if (!parentSessionId) {
    return { ok: false, runs: [], error: '缺少会话' }
  }
  return { ok: true, runs: listSubagentRunsForParent(parentSessionId) }
}

export function hostGetSubagent(
  runId: string,
  parentSessionId?: string,
): SubagentToolResult {
  return getSubagentRunResult(runId, { parentSessionId })
}

export function hostReclaimSubagent(
  runId: string,
  parentSessionId?: string,
): SubagentToolResult {
  return reclaimSubagentRun(runId, { parentSessionId })
}
