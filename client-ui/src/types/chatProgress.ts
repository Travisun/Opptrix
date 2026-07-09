export type ChatToolStepStatus = 'running' | 'done' | 'error'

export interface ChatUserPromptPayload {
  id: string
  title?: string
  prompt: string
  options: Array<{ id: string; label: string }>
  allowMultiple?: boolean
}

export interface UserPromptAnswerPayload {
  kind: 'option' | 'custom'
  selected_ids: string[]
  selected_labels: string[]
  custom_text?: string
}

export interface ChatToolStep {
  id: string
  tool: string
  label: string
  status: ChatToolStepStatus
  argsPreview?: string
  thinking?: string
  resultPreview?: string
  resultDetail?: string
  startedAt: string
  finishedAt?: string
}

export type ChatProgressEvent =
  | { type: 'thinking'; round: number; label: string; snippet?: string }
  | { type: 'tool_start'; step: ChatToolStep }
  | { type: 'tool_done'; step: ChatToolStep }
  | { type: 'user_prompt'; prompt: ChatUserPromptPayload }
  | { type: 'reply'; content: string }
  | {
    type: 'done'
    reply: string
    tools_used: string[]
    session_id: string
    title?: string
    tool_steps: ChatToolStep[]
    cancelled?: boolean
  }
  | { type: 'error'; message: string }

export interface ChatLiveTrace {
  thinkingLabel?: string
  thinkingSnippet?: string
  steps: ChatToolStep[]
}
