import type { ChatToolStep } from './chatProgress'

export interface SessionMeta {
  id: string
  title: string
  createdAt: string
  updatedAt: string
  /** providerId:modelName */
  model?: string
}

export interface AvailableModel {
  ref: string
  model: string
  providerId: string
  providerName: string
}

export interface ChatDisplayMessage {
  role: 'user' | 'assistant'
  content: string
  toolsUsed?: string[]
  toolSteps?: ChatToolStep[]
  at: string
}

export interface SessionForkContextRef {
  kind: 'fork'
  sourceSessionId: string
  sourceSessionTitle: string
  anchorIndex: number
  anchorAt: string
  preview: string
  turns: ChatDisplayMessage[]
}

export interface SessionSelectionContextRef {
  kind: 'selection'
  selectedText: string
  sourceMessageIndex: number
  sourceRole: 'user' | 'assistant'
  anchorAt: string
  preview: string
  turns: ChatDisplayMessage[]
}

export type SessionContextRef = SessionForkContextRef | SessionSelectionContextRef

export interface MessageSelection {
  text: string
  messageIndex: number
  messageRole: 'user' | 'assistant'
}

export interface EphemeralAskTurn {
  role: 'user' | 'assistant'
  content: string
}
