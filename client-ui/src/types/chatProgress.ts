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
