/** LLM token 用量（与 OpenAI usage 字段对齐） */
export interface TokenUsage {
  promptTokens: number
  completionTokens: number
  totalTokens: number
}

export interface TokenUsageDisplay extends TokenUsage {
  /** 无上游 usage 时为 true，UI 展示「约」 */
  estimated?: boolean
}

export function emptyTokenUsage(): TokenUsage {
  return { promptTokens: 0, completionTokens: 0, totalTokens: 0 }
}

export function mergeTokenUsage(a: TokenUsage, b: TokenUsage): TokenUsage {
  return {
    promptTokens: a.promptTokens + b.promptTokens,
    completionTokens: a.completionTokens + b.completionTokens,
    totalTokens: a.totalTokens + b.totalTokens,
  }
}

export function parseOpenAiUsage(raw: unknown): TokenUsage | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const u = raw as Record<string, unknown>
  const prompt = typeof u.prompt_tokens === 'number' ? u.prompt_tokens : undefined
  const completion = typeof u.completion_tokens === 'number' ? u.completion_tokens : undefined
  const total = typeof u.total_tokens === 'number' ? u.total_tokens : undefined
  if (prompt === undefined && completion === undefined && total === undefined) return undefined
  const promptTokens = Math.max(0, prompt ?? 0)
  const completionTokens = Math.max(0, completion ?? 0)
  const totalTokens = Math.max(0, total ?? promptTokens + completionTokens)
  return { promptTokens, completionTokens, totalTokens }
}
