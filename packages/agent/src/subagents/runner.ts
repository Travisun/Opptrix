/**
 * Subagent runner — 创建 child session、嵌套 chat、按 result_schema 校验终态。
 */

import type { ChatProgressEvent, ChatProgressOptions } from '../chat-progress.js'
import { getSessionResumeBus } from '../jobs/resume-bus.js'
import type { CreateSessionOptions, SessionRecord } from '../sessions.js'
import { resolveAuthSessionId } from './auth-resolve.js'
import { validateSubagentResult } from './contract.js'
import { getSubagentRunRegistry, type SubagentRunRegistry } from './registry.js'
import type {
  SubagentResultSchema,
  SubagentRole,
  SubagentRun,
  SubagentRunMode,
  SubagentToolResult,
} from './types.js'

export interface SubagentRunnerHost {
  createSession: (opts: CreateSessionOptions) => SessionRecord
  getSession: (id: string) => SessionRecord | null
  /**
   * 嵌套 chat。实现方须：
   * - 保存/恢复 lastRoundPackIds 等父状态
   * - 子会话工具经 filterToolNamesForSubagent
   * - workspace bridge 绑 child key、sessionId=root
   */
  chat: (
    sessionId: string,
    message: string,
    progress?: ChatProgressOptions,
    modelRef?: string,
  ) => Promise<{ reply: string; sessionId: string }>
  /** 取消子 chat */
  abortSessionChat?: (sessionId: string) => void
}

export interface RunSubagentParams {
  parentSessionId: string
  role: SubagentRole
  task: string
  context?: string
  result_schema: SubagentResultSchema
  mode?: SubagentRunMode
  label?: string
  /** 父进度回调（映射 subagent_*） */
  emit?: (event: ChatProgressEvent) => void
  signal?: AbortSignal
}

function buildChildUserMessage(task: string, context: string | undefined, schema: SubagentResultSchema): string {
  const schemaJson = JSON.stringify(schema, null, 2)
  const parts = [
    '【子任务】',
    task.trim(),
  ]
  if (context?.trim()) {
    parts.push('', '【上下文】', context.trim())
  }
  parts.push(
    '',
    '【输出契约】',
    '你必须仅输出一个符合下列 JSON Schema 的 JSON 对象（可放在 ```json 围栏中）。不要输出其它说明文字。',
    schemaJson,
  )
  return parts.join('\n')
}

function buildRetryMessage(errors: string[]): string {
  return [
    '【契约校验失败 — 请重试】',
    '上一轮输出未通过 result_schema 校验：',
    ...errors.map(e => `- ${e}`),
    '',
    '请仅输出修正后的 JSON 对象，不要其它说明。',
  ].join('\n')
}

function toToolResult(run: SubagentRun): SubagentToolResult {
  return {
    ok: run.status === 'completed',
    run_id: run.id,
    status: run.status,
    label: run.label,
    result: run.result,
    error: run.error,
    summary: run.summary,
    needs_parent_action: run.needsParentAction,
    child_session_id: run.childSessionId,
  }
}

function emitSubagent(
  emit: ((e: ChatProgressEvent) => void) | undefined,
  type: 'subagent_started' | 'subagent_progress' | 'subagent_done',
  run: SubagentRun,
  extra?: { summary?: string },
): void {
  if (!emit) return
  const base = {
    run_id: run.id,
    label: run.label,
    status: run.status,
    child_session_id: run.childSessionId,
    mode: run.mode,
  }
  if (type === 'subagent_started') {
    emit({ type: 'subagent_started', ...base })
    return
  }
  if (type === 'subagent_progress') {
    emit({
      type: 'subagent_progress',
      ...base,
      summary: extra?.summary ?? run.summary,
    })
    return
  }
  emit({
    type: 'subagent_done',
    ...base,
    summary: extra?.summary ?? run.summary ?? run.error,
  })
}

/** 仅 background 的 completed/failed/needs_parent_action 通知父会话（cancelled / foreground 不 enqueue） */
function notifyParentOnBackgroundTerminal(run: SubagentRun): void {
  if (run.mode !== 'background') return
  if (
    run.status !== 'completed'
    && run.status !== 'failed'
    && run.status !== 'needs_parent_action'
  ) {
    return
  }
  const label = (run.label || '协作任务').trim() || '协作任务'
  const statusHint = run.status === 'completed'
    ? '已完成'
    : run.status === 'needs_parent_action'
      ? '需要你处理'
      : '未成功'
  const summary = (
    run.summary
    ?? run.needsParentAction?.message
    ?? run.error
    ?? ''
  ).trim() || '（无摘要）'
  const prompt = [
    `协作任务「${label}」${statusHint}。`,
    `状态：${run.status}`,
    `摘要：${summary}`,
    `run_id: ${run.id}`,
    '',
    '请根据上述结果决定如何继续（需要时可调用 get_subagent 查看完整结果；勿 poll / sleep / 反复查进度）。',
  ].join('\n')
  getSessionResumeBus().enqueue({
    sessionId: run.parentSessionId,
    cause: 'subagent_terminal',
    jobId: run.id,
    prompt,
  })
}

/**
 * Foreground：阻塞到 completed/failed/cancelled。
 * Background：登记后异步跑，立即返回 run_id。
 */
export async function runSubagent(
  host: SubagentRunnerHost,
  params: RunSubagentParams,
  registry: SubagentRunRegistry = getSubagentRunRegistry(),
): Promise<SubagentToolResult> {
  const parentId = params.parentSessionId.trim()
  if (!parentId) {
    return {
      ok: false,
      run_id: '',
      status: 'failed',
      error: '缺少父会话',
    }
  }

  const parent = host.getSession(parentId)
  if (!parent) {
    return {
      ok: false,
      run_id: '',
      status: 'failed',
      error: '父会话不存在',
    }
  }

  if (parent.kind === 'subagent' || parent.parentSessionId) {
    return {
      ok: false,
      run_id: '',
      status: 'failed',
      error: '子任务不能再委派',
    }
  }

  const rootSessionId = resolveAuthSessionId(parentId, id => {
    const s = host.getSession(id)
    if (!s) return null
    return {
      kind: s.kind,
      rootSessionId: s.rootSessionId,
      parentSessionId: s.parentSessionId,
    }
  })

  const roleName = params.role.name?.trim() || '子任务'
  const instructions = params.role.instructions?.trim() || ''
  const child = host.createSession({
    title: `子任务 · ${roleName}`.slice(0, 48),
    kind: 'subagent',
    parentSessionId: parentId,
    rootSessionId,
    rolePersona: instructions || null,
    model: params.role.model?.trim() || parent.model,
  })

  if (params.role.temperature != null && Number.isFinite(params.role.temperature)) {
    const rec = host.getSession(child.id)
    if (rec) {
      // llmParams 由引擎 update 更干净；此处仅在 create 后尽量写入 persona
      void rec
    }
  }

  const schema = params.result_schema
  if (!schema || schema.type !== 'object') {
    return {
      ok: false,
      run_id: '',
      status: 'failed',
      error: 'result_schema 须为 type:"object"',
    }
  }

  const run = registry.create({
    parentSessionId: parentId,
    rootSessionId,
    childSessionId: child.id,
    role: {
      name: roleName,
      instructions,
      model: params.role.model,
      temperature: params.role.temperature,
      max_rounds: params.role.max_rounds,
    },
    task: params.task,
    context: params.context,
    resultSchema: schema,
    mode: params.mode ?? 'foreground',
    label: params.label,
  })

  const mode = params.mode ?? 'foreground'
  if (mode === 'background') {
    void executeRun(host, run.id, params, registry).catch(err => {
      const msg = err instanceof Error ? err.message : String(err)
      registry.setStatus(run.id, 'failed', {
        error: msg,
        finishedAt: new Date().toISOString(),
      })
      const failed = registry.get(run.id)
      if (failed) {
        emitSubagent(params.emit, 'subagent_done', failed)
        notifyParentOnBackgroundTerminal(failed)
      }
    })
    return {
      ok: true,
      run_id: run.id,
      status: 'queued',
      label: run.label,
      child_session_id: child.id,
      summary: '子任务已在后台启动',
    }
  }

  return executeRun(host, run.id, params, registry)
}

async function executeRun(
  host: SubagentRunnerHost,
  runId: string,
  params: RunSubagentParams,
  registry: SubagentRunRegistry,
): Promise<SubagentToolResult> {
  const run = registry.get(runId)
  if (!run) {
    return { ok: false, run_id: runId, status: 'failed', error: 'run 不存在' }
  }

  registry.setStatus(runId, 'running', { startedAt: new Date().toISOString() })
  const started = registry.get(runId)!
  emitSubagent(params.emit, 'subagent_started', started)

  const mapChildProgress = (event: ChatProgressEvent): void => {
    if (!params.emit) return
    if (event.type === 'thinking') {
      emitSubagent(params.emit, 'subagent_progress', started, {
        summary: event.label,
      })
    } else if (event.type === 'error') {
      emitSubagent(params.emit, 'subagent_progress', started, {
        summary: event.message,
      })
    }
  }

  const userMsg = buildChildUserMessage(run.task, run.context, run.resultSchema)
  const modelRef = run.role.model?.trim() || undefined

  try {
    if (params.signal?.aborted) {
      registry.setStatus(runId, 'cancelled', {
        finishedAt: new Date().toISOString(),
        error: '已取消',
      })
      const cancelled = registry.get(runId)!
      emitSubagent(params.emit, 'subagent_done', cancelled)
      return toToolResult(cancelled)
    }

    const first = await host.chat(
      run.childSessionId,
      userMsg,
      { onProgress: mapChildProgress, signal: params.signal },
      modelRef,
    )

    const afterFirst = registry.get(runId)
    if (afterFirst?.status === 'needs_parent_action') {
      emitSubagent(params.emit, 'subagent_done', afterFirst)
      return toToolResult(afterFirst)
    }

    let validated = validateSubagentResult(first.reply, run.resultSchema)
    if (!validated.ok) {
      emitSubagent(params.emit, 'subagent_progress', started, {
        summary: '契约校验失败，正在自动重试',
      })
      const second = await host.chat(
        run.childSessionId,
        buildRetryMessage(validated.errors),
        { onProgress: mapChildProgress, signal: params.signal },
        modelRef,
      )
      const afterRetry = registry.get(runId)
      if (afterRetry?.status === 'needs_parent_action') {
        emitSubagent(params.emit, 'subagent_done', afterRetry)
        return toToolResult(afterRetry)
      }
      validated = validateSubagentResult(second.reply, run.resultSchema)
    }

    if (!validated.ok) {
      registry.setStatus(runId, 'failed', {
        finishedAt: new Date().toISOString(),
        error: `result_schema 校验失败：${validated.errors.join('; ')}`,
        summary: '输出未通过契约校验',
      })
      const failed = registry.get(runId)!
      emitSubagent(params.emit, 'subagent_done', failed)
      notifyParentOnBackgroundTerminal(failed)
      return toToolResult(failed)
    }

    const summary = typeof validated.value.summary === 'string'
      ? validated.value.summary
      : '协作任务已完成'
    registry.setStatus(runId, 'completed', {
      finishedAt: new Date().toISOString(),
      result: validated.value,
      summary,
    })
    const done = registry.get(runId)!
    emitSubagent(params.emit, 'subagent_done', done)
    notifyParentOnBackgroundTerminal(done)
    return toToolResult(done)
  } catch (err) {
    const aborted = params.signal?.aborted
      || (err instanceof DOMException && err.name === 'AbortError')
      || (err instanceof Error && err.name === 'ChatCancelledError')
    if (aborted) {
      registry.setStatus(runId, 'cancelled', {
        finishedAt: new Date().toISOString(),
        error: '已取消',
      })
      const cancelled = registry.get(runId)!
      emitSubagent(params.emit, 'subagent_done', cancelled)
      return toToolResult(cancelled)
    }
    const msg = err instanceof Error ? err.message : String(err)
    registry.setStatus(runId, 'failed', {
      finishedAt: new Date().toISOString(),
      error: msg,
    })
    const failed = registry.get(runId)!
    emitSubagent(params.emit, 'subagent_done', failed)
    notifyParentOnBackgroundTerminal(failed)
    return toToolResult(failed)
  }
}

export async function cancelSubagentRun(
  runId: string,
  host: Pick<SubagentRunnerHost, 'abortSessionChat'>,
  registry: SubagentRunRegistry = getSubagentRunRegistry(),
): Promise<SubagentToolResult> {
  const run = registry.get(runId)
  if (!run) {
    return { ok: false, run_id: runId, status: 'failed', error: 'run 不存在' }
  }
  if (run.status === 'completed' || run.status === 'failed' || run.status === 'cancelled') {
    return toToolResult(run)
  }
  host.abortSessionChat?.(run.childSessionId)
  registry.setStatus(runId, 'cancelled', {
    finishedAt: new Date().toISOString(),
    error: '已取消',
  })
  return toToolResult(registry.get(runId)!)
}

export function getSubagentRunResult(
  runId: string,
  opts?: { parentSessionId?: string; registry?: SubagentRunRegistry },
): SubagentToolResult {
  const registry = opts?.registry ?? getSubagentRunRegistry()
  const run = registry.get(runId)
  if (!run) {
    return { ok: false, run_id: runId, status: 'failed', error: 'run 不存在' }
  }
  const parentId = opts?.parentSessionId?.trim()
  if (parentId && run.parentSessionId !== parentId) {
    return {
      ok: false,
      run_id: runId,
      status: 'failed',
      error: '任务不存在或不属于该会话',
    }
  }
  return toToolResult(run)
}

export function listSubagentRunsForParent(
  parentSessionId: string,
  registry: SubagentRunRegistry = getSubagentRunRegistry(),
): Array<{
  run_id: string
  label: string
  status: SubagentRun['status']
  summary?: string
  child_session_id: string
  mode: SubagentRunMode
  updated_at: string
}> {
  return registry.listByParent(parentSessionId).map(r => ({
    run_id: r.id,
    label: r.label,
    status: r.status,
    summary: r.summary,
    child_session_id: r.childSessionId,
    mode: r.mode,
    updated_at: r.updatedAt,
  }))
}

/** P0：标记已读/回收终态 run（不删会话） */
export function reclaimSubagentRun(
  runId: string,
  opts?: { parentSessionId?: string; registry?: SubagentRunRegistry },
): SubagentToolResult {
  const registry = opts?.registry ?? getSubagentRunRegistry()
  const run = registry.get(runId)
  if (!run) {
    return { ok: false, run_id: runId, status: 'failed', error: 'run 不存在' }
  }
  const parentId = opts?.parentSessionId?.trim()
  if (parentId && run.parentSessionId !== parentId) {
    return {
      ok: false,
      run_id: runId,
      status: 'failed',
      error: '任务不存在或不属于该会话',
    }
  }
  if (run.status === 'running' || run.status === 'queued') {
    return {
      ok: false,
      run_id: runId,
      status: run.status,
      error: '运行中的子任务请先 cancel_subagent',
    }
  }
  return {
    ...toToolResult(run),
    ok: true,
    summary: run.summary ?? `已回收（${run.status}）`,
  }
}
