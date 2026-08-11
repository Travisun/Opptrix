/**
 * 按模型名启发式解析上下文窗口（tokens）。
 * 未知模型默认 128k；不要求用户配置。
 */

export const DEFAULT_CONTEXT_TOKENS = 128_000
export const OUTPUT_RESERVE_TOKENS = 8_192
/** soft：触发 microcompact；hard：触发 structured compact（对齐 0.85） */
export const SOFT_USAGE_RATIO = 0.85
export const HARD_USAGE_RATIO = 0.85

interface ModelContextRule {
  match: RegExp
  tokens: number
}

/** 按优先级匹配（更具体的规则应靠前） */
const MODEL_CONTEXT_RULES: ModelContextRule[] = [
  { match: /claude[-_]?(opus|sonnet).*[14]m|\[1m\]|1m[-_]?context/i, tokens: 1_000_000 },
  { match: /gemini[-_]?2\.5|gemini[-_]?2\.0|gemini[-_]?1\.5/i, tokens: 1_000_000 },
  { match: /gpt[-_]?4\.1|o3|o4[-_]?mini/i, tokens: 200_000 },
  { match: /claude[-_]?(opus|sonnet|haiku).*4|claude[-_]?3[-_.]?[57]/i, tokens: 200_000 },
  { match: /gpt[-_]?4o|chatgpt[-_]?4o|gpt[-_]?4[-_]?turbo/i, tokens: 128_000 },
  { match: /deepseek|qwen[-_]?2\.5|qwen2\.5|qwen[-_]?long|qwq/i, tokens: 128_000 },
  { match: /qwen|moonshot|kimi|glm[-_]?4|doubao/i, tokens: 128_000 },
  { match: /gpt[-_]?3\.5|gpt[-_]?35/i, tokens: 16_384 },
  { match: /claude[-_]?instant|claude[-_]?2/i, tokens: 100_000 },
  { match: /llama[-_]?3|llama3/i, tokens: 128_000 },
  { match: /mistral|mixtral|command[-_]?r/i, tokens: 128_000 },
]

export function resolveModelContextTokens(modelId: string): number {
  const id = modelId.trim()
  if (!id) return DEFAULT_CONTEXT_TOKENS
  for (const rule of MODEL_CONTEXT_RULES) {
    if (rule.match.test(id)) return rule.tokens
  }
  return DEFAULT_CONTEXT_TOKENS
}

export interface ContextBudget {
  contextTokens: number
  /** system + tools 预留（调用方传入估算或默认） */
  systemToolsReserve: number
  outputReserve: number
  /** 可用于历史/memory 的预算 */
  historyBudget: number
  softLimit: number
  hardLimit: number
}

export function resolveContextBudget(
  contextTokens: number,
  systemToolsReserve = 6_000,
): ContextBudget {
  const outputReserve = OUTPUT_RESERVE_TOKENS
  const sysReserve = Math.max(0, Math.floor(systemToolsReserve))
  const historyBudget = Math.max(2_000, contextTokens - outputReserve - sysReserve)
  return {
    contextTokens,
    systemToolsReserve: sysReserve,
    outputReserve,
    historyBudget,
    softLimit: Math.floor(historyBudget * SOFT_USAGE_RATIO),
    hardLimit: Math.floor(historyBudget * HARD_USAGE_RATIO),
  }
}

export function usageRatio(usedTokens: number, budget: ContextBudget): number {
  if (budget.historyBudget <= 0) return 1
  return usedTokens / budget.historyBudget
}
