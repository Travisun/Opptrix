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
  at: string
}

export interface SkillInfo {
  name: string
  description: string
  category: string
  examplePrompt: string
}

export interface SkillCategory {
  category: string
  skills: SkillInfo[]
}
