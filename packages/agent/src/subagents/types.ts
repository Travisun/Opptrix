/**
 * Session Subagents — 运行记录与角色契约类型。
 * 父会话委派；子会话无侧栏入口；终态须通过 result_schema 校验。
 */

export type SubagentRunStatus =
  | 'queued'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'needs_parent_action'

export interface SubagentRole {
  name: string
  instructions: string
  model?: string
  temperature?: number
  max_rounds?: number
}

export type SubagentRunMode = 'foreground' | 'background'

/** JSON Schema object（Draft-07 子集），用于终态契约校验 */
export type SubagentResultSchema = {
  type: 'object'
  properties?: Record<string, unknown>
  required?: string[]
  additionalProperties?: boolean | Record<string, unknown>
  [key: string]: unknown
}

export interface SubagentRun {
  id: string
  parentSessionId: string
  rootSessionId: string
  childSessionId: string
  label: string
  role: SubagentRole
  task: string
  context?: string
  resultSchema: SubagentResultSchema
  mode: SubagentRunMode
  status: SubagentRunStatus
  createdAt: string
  updatedAt: string
  startedAt?: string
  finishedAt?: string
  /** 契约校验通过后的结构化结果 */
  result?: Record<string, unknown>
  /** 失败/取消/缺权说明 */
  error?: string
  /** 面向父会话的短摘要 */
  summary?: string
  /** 子缺确认权时交父处理的提示 */
  needsParentAction?: {
    kind: 'confirm' | 'secret' | 'lan' | 'other'
    message: string
  }
}

export interface CreateSubagentRunInput {
  parentSessionId: string
  rootSessionId: string
  childSessionId: string
  role: SubagentRole
  task: string
  context?: string
  resultSchema: SubagentResultSchema
  mode?: SubagentRunMode
  label?: string
}

export interface SubagentToolResult {
  ok: boolean
  run_id: string
  status: SubagentRunStatus
  label?: string
  result?: Record<string, unknown>
  error?: string
  summary?: string
  needs_parent_action?: SubagentRun['needsParentAction']
  child_session_id?: string
  /** 同 label/role 已有 queued|running 时复用，未新建 run */
  deduped?: boolean
  /** restart_run_id 成功排队/执行 */
  restarted?: boolean
}
