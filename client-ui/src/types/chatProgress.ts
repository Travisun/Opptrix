export type ChatToolStepStatus = 'running' | 'done' | 'error'

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
  | { type: 'reply'; content: string }
  | {
    type: 'done'
    reply: string
    tools_used: string[]
    session_id: string
    title?: string
    tool_steps: ChatToolStep[]
  }
  | { type: 'error'; message: string }

export interface ChatLiveTrace {
  thinkingLabel?: string
  thinkingSnippet?: string
  steps: ChatToolStep[]
}
