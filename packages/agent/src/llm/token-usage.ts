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
  if (typeof u.prompt_cache_hit_tokens === 'number' && Number.isFinite(u.prompt_cache_hit_tokens)) {
    return Math.max(0, u.prompt_cache_hit_tokens)
  }
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

/** 上游有 cached 上报时：round(100 * cached / max(prompt, 1))，钳制 0–100；无字段 → undefined */
export function computeCacheHitPercent(
  cachedPromptTokens: number | undefined,
  promptTokens: number,
): number | undefined {
  if (cachedPromptTokens === undefined) return undefined
  const denom = Math.max(promptTokens, 1)
  return Math.min(100, Math.max(0, Math.round((100 * cachedPromptTokens) / denom)))
}

/** 是否存在任意 assistant turn 且上游回报过 usage（不要求含 cached 字段） */
export function hasAssistantTurnUsage(
  turns: Array<{ role: string; usage?: TokenUsage }> | undefined,
): boolean {
  if (!turns?.length) return false
  return turns.some((turn) => turn.role === 'assistant' && turn.usage !== undefined)
}

/** 最近一轮 assistant turn 含 cached 上报的 usage（从新到旧） */
export function resolveLatestTurnCacheUsage(
  turns: Array<{ role: string; usage?: TokenUsage }> | undefined,
): TokenUsage | undefined {
  if (!turns?.length) return undefined
  for (let i = turns.length - 1; i >= 0; i--) {
    const turn = turns[i]
    if (turn.role === 'assistant' && turn.usage?.cachedPromptTokens !== undefined) {
      return turn.usage
    }
  }
  return undefined
}

/** 最近一轮 turn 优先；否则会话累计 usageTotals（均有 cached 字段才返回） */
export function resolveSessionCacheHitSource(
  turns: Array<{ role: string; usage?: TokenUsage }> | undefined,
  usageTotals?: TokenUsage | null,
): Pick<TokenUsage, 'cachedPromptTokens' | 'promptTokens'> | undefined {
  const fromTurn = resolveLatestTurnCacheUsage(turns)
  if (fromTurn?.cachedPromptTokens !== undefined) return fromTurn
  if (usageTotals?.cachedPromptTokens !== undefined) return usageTotals
  return undefined
}

/** 稳定 prompt_cache_key（同会话多轮不变；schema 冷启动时 generation>0 追加后缀） */
export function promptCacheKeyForSession(sessionId: string, schemaGeneration = 0): string {
  const base = `opptrix-session:${sessionId}`
  return schemaGeneration > 0 ? `${base}:s${schemaGeneration}` : base
}
