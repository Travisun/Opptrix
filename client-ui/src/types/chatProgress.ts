import type { TokenUsage } from './chat'
import type { ReasoningSegment } from '../chat/reasoningTimeline'

export type ChatToolStepStatus = 'running' | 'done' | 'error'

export interface ChatUserPromptPayload {
  id: string
  title?: string
  prompt: string
  /** confirm/text 为空数组；choice 为 2–50 项 */
  options: Array<{ id: string; label: string }>
  allowMultiple?: boolean
  /** confirm=拒绝/确认；choice=选项；text=开放填空 */
  mode?: 'confirm' | 'choice' | 'text'
  kind?: 'choice' | 'secret'
  name?: string
  inject_hosts?: string[]
  reject_label?: string
  confirm_label?: string
  allow_custom?: boolean
}

export interface UserPromptAnswerPayload {
  kind: 'option' | 'custom' | 'secret'
  selected_ids: string[]
  selected_labels: string[]
  custom_text?: string
  name?: string
  secret_value?: string
  inject_hosts?: string[]
}

export interface ChatToolStep {
  id: string
  tool: string
  label: string
  status: ChatToolStepStatus
  argsPreview?: string
  argsDetail?: string
  thinking?: string
  resultPreview?: string
  resultDetail?: string
  startedAt: string
  finishedAt?: string
  /** 大输出已截断/落盘（兼容后端多种字段） */
  truncated?: boolean
  resultTruncated?: boolean
  /** 后端用户向提示；UI 优先用固定产品文案，不直接展示技术内容 */
  ui_hint?: string
  /** 相对路径信号；仅作截断判定，禁止展示给用户 */
  saved_rel_path?: string
}

export interface ChatTurnUsageSnapshot extends TokenUsage {
  estimated?: boolean
}

export interface ChatContextUsageSnapshot {
  usedTokens: number
  limitTokens: number
  remainingTokens: number
  modelRef: string
  estimated: boolean
  usagePercent?: number
  compacted?: boolean
  /** 最近一轮前缀缓存命中率 0–100；无上报则省略 */
  cacheHitPercent?: number
  cachedPromptTokens?: number
}

export type ChatProgressEvent =
  | {
    type: 'thinking'
    round: number
    label: string
    snippet?: string
    segments?: ReasoningSegment[]
  }
  | { type: 'tool_start'; step: ChatToolStep }
  | { type: 'tool_done'; step: ChatToolStep }
  | { type: 'user_prompt'; prompt: ChatUserPromptPayload }
  | { type: 'steer_applied'; message: string }
  | { type: 'reply'; content?: string; estimatedTokens?: number }
  | {
    type: 'done'
    reply: string
    tools_used: string[]
    session_id: string
    title?: string
    tool_steps: ChatToolStep[]
    cancelled?: boolean
    turn_usage?: ChatTurnUsageSnapshot
    context_usage?: ChatContextUsageSnapshot
  }
  | { type: 'error'; message: string }
  | {
    type: 'context_compact'
    level: 'micro' | 'structured' | 'overflow_retry'
    message: string
    usageRatio?: number
    contextTokens?: number
  }
  | {
    type: 'job_watch'
    action: 'attached' | 'deduped' | 'updated' | 'cleared' | 'resuming'
    watch_id: string
    job_id: string
    kind: string
    label: string
    percent?: number
    eta_seconds?: number
    source: string
  }
  | {
    type: 'job_progress'
    job_id: string
    kind: string
    state: string
    label: string
    percent?: number
    title?: string
    cancelable?: boolean
    stdout_tail?: string
  }
  | {
    type: 'subagent_started'
    run_id: string
    label: string
    status: string
    child_session_id?: string
    mode?: string
  }
  | {
    type: 'subagent_progress'
    run_id: string
    label: string
    status: string
    child_session_id?: string
    mode?: string
    summary?: string
  }
  | {
    type: 'subagent_done'
    run_id: string
    label: string
    status: string
    child_session_id?: string
    mode?: string
    summary?: string
  }
  | {
    type: 'subagent_child_progress'
    run_id: string
    child_session_id?: string
    label?: string
    mode?: string
    /** Agent 合入形态：嵌套子过程 */
    child?:
      | {
        type: 'thinking'
        round: number
        label: string
        snippet?: string
        segments?: ReasoningSegment[]
      }
      | { type: 'tool_start'; step: ChatToolStep }
      | { type: 'tool_done'; step: ChatToolStep }
      | { type: 'reply'; content?: string; estimatedTokens?: number }
    /** 兼容字段名：event / progress / child_progress */
    event?: ChatProgressEvent
    progress?: ChatProgressEvent
    child_progress?: ChatProgressEvent
  }

export interface ChatLiveTrace {
  /** 展示用完整状态行（由 phaseLabel / tokens / 步数拼装） */
  thinkingLabel?: string
  /** 阶段文案，不含省略号后缀，如「模型正在整理结果」 */
  phaseLabel?: string
  /** 当前 LLM 轮次已消耗的估算 token */
  estimatedTokens?: number
  /** 派生全文（兼容）；展示优先 thinkingSegments */
  thinkingSnippet?: string
  /** 结构化思考分段（竖轴） */
  thinkingSegments?: ReasoningSegment[]
  steps: ChatToolStep[]
}
