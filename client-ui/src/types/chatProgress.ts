import type { TokenUsage } from './chat'

export type ChatToolStepStatus = 'running' | 'done' | 'error'

export interface ChatUserPromptPayload {
  id: string
  title?: string
  prompt: string
  /** 空数组 = confirm 模式（底部拒绝/确认） */
  options: Array<{ id: string; label: string }>
  allowMultiple?: boolean
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
}

export type ChatProgressEvent =
  | { type: 'thinking'; round: number; label: string; snippet?: string }
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
  thinkingLabel?: string
  thinkingSnippet?: string
  steps: ChatToolStep[]
}
