/** LLM token 用量（与 OpenAI usage 字段对齐） */
export interface TokenUsage {
  promptTokens: number
  completionTokens: number
  totalTokens: number
  /** 上游 prompt cache 命中 tokens（仅观测；缺省表示未上报） */
  cachedPromptTokens?: number
}

export interface TokenUsageDisplay extends TokenUsage {
  /** 无上游 usage 时为 true，UI 展示「约」 */
  estimated?: boolean
}

/** chat-debug / 观测：warm=命中；cold=有字段且为 0；unknown=无字段 */
export type CacheWarmth = 'warm' | 'cold' | 'unknown'

export function emptyTokenUsage(): TokenUsage {
  return { promptTokens: 0, completionTokens: 0, totalTokens: 0 }
}

export function mergeTokenUsage(a: TokenUsage, b: TokenUsage): TokenUsage {
  const out: TokenUsage = {
    promptTokens: a.promptTokens + b.promptTokens,
    completionTokens: a.completionTokens + b.completionTokens,
    totalTokens: a.totalTokens + b.totalTokens,
  }
  if (a.cachedPromptTokens !== undefined || b.cachedPromptTokens !== undefined) {
    out.cachedPromptTokens = (a.cachedPromptTokens ?? 0) + (b.cachedPromptTokens ?? 0)
  }
  return out
}

function parseCachedPromptTokens(u: Record<string, unknown>): number | undefined {
  if (typeof u.cached_tokens === 'number' && Number.isFinite(u.cached_tokens)) {
    return Math.max(0, u.cached_tokens)
  }
  const details = u.prompt_tokens_details
  if (details && typeof details === 'object' && !Array.isArray(details)) {
    const cached = (details as Record<string, unknown>).cached_tokens
    if (typeof cached === 'number' && Number.isFinite(cached)) {
      return Math.max(0, cached)
    }
  }
  return undefined
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
  const cachedPromptTokens = parseCachedPromptTokens(u)
  return {
    promptTokens,
    completionTokens,
    totalTokens,
    ...(cachedPromptTokens !== undefined ? { cachedPromptTokens } : {}),
  }
}

/** 仅观测：不据此改写上下文。无 usage 或无 cached 字段 → unknown */
export function resolveCacheWarmth(
  usage?: Pick<TokenUsage, 'cachedPromptTokens'> | null,
): CacheWarmth {
  if (!usage || usage.cachedPromptTokens === undefined) return 'unknown'
  return usage.cachedPromptTokens > 0 ? 'warm' : 'cold'
}

/** 稳定 prompt_cache_key（同会话多轮不变） */
export function promptCacheKeyForSession(sessionId: string): string {
  return `opptrix-session:${sessionId}`
}
