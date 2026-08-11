/**
 * 输出额度 ladder — 历史默认 4096 / 旧普模 16k 会被长回复或思考吃光。
 * 机制对齐 Reasonix AutoOutputBudget；普模默认 32k，用户可显式选 64k / 128k。
 */

export const LEGACY_DEFAULT_MAX_TOKENS = 4096
/** 旧普模默认（16k）；未真正定制时抬到普模 32k */
export const LEGACY_ORDINARY_OUTPUT_TOKENS = 16_384

/** 普模默认 32k（与推理 low|medium 同档） */
export const ORDINARY_OUTPUT_TOKENS = 32_768
export const REASONING_OUTPUT_TOKENS = 32_768
export const HIGH_REASONING_OUTPUT_TOKENS = 65_536

export const OUTPUT_TOKENS_64K = 65_536
export const OUTPUT_TOKENS_128K = 131_072

/** UI / 会话可选档位：32k | 64k | 128k */
export const MAX_OUTPUT_TOKENS_PRESETS = [
  ORDINARY_OUTPUT_TOKENS,
  OUTPUT_TOKENS_64K,
  OUTPUT_TOKENS_128K,
] as const

export type ReasoningEffortLevel = 'low' | 'medium' | 'high'

/** 模型名启发式：DeepSeek flash/reasoner/r1 等长思考模型 */
export function looksLikeReasoningModel(model?: string | null): boolean {
  if (!model?.trim()) return false
  const m = model.toLowerCase()
  if (/\br1\b|reasoner|thinking/.test(m)) return true
  if (m.includes('deepseek') && (m.includes('flash') || m.includes('reason') || m.includes('r1'))) {
    return true
  }
  return false
}

/**
 * 按是否启用思考与 effort 给出自动输出额度。
 * - 非推理：32k（ORDINARY_OUTPUT_TOKENS；普模默认）
 * - 推理 / low|medium：32k（亦可按模型启发式启用）
 * - high：64k
 */
export function autoOutputBudget(
  reasoningEnabled: boolean,
  effort?: ReasoningEffortLevel | null,
): number {
  if (!reasoningEnabled) return ORDINARY_OUTPUT_TOKENS
  if (effort === 'high') return HIGH_REASONING_OUTPUT_TOKENS
  return REASONING_OUTPUT_TOKENS
}

function isLegacyUnsetMaxTokens(n: number, ladder: number): boolean {
  if (ladder <= n) return false
  return n === LEGACY_DEFAULT_MAX_TOKENS || n === LEGACY_ORDINARY_OUTPUT_TOKENS
}

/**
 * 解析本轮请求 max_tokens。
 * - 未设置 → 自动 ladder（普模 32k / 推理 32k / high 64k）
 * - 显式更高（含 64k / 128k）→ 尊重用户
 * - 显式更低且非历史默认 → 尊重用户偏低设置
 * - 显式等于 4096 或旧 16k 且 ladder 更高 → 视为未真正定制，抬升
 */
export function resolveRequestMaxTokens(opts: {
  explicitMaxTokens?: number | null
  reasoningEffort?: ReasoningEffortLevel | null
  model?: string | null
}): number {
  const effort = opts.reasoningEffort ?? undefined
  const reasoning = Boolean(effort) || looksLikeReasoningModel(opts.model)
  const ladder = autoOutputBudget(reasoning, effort)
  const explicit = opts.explicitMaxTokens

  if (explicit == null || !Number.isFinite(explicit) || explicit < 1) {
    return ladder
  }
  const n = Math.min(1_000_000, Math.floor(explicit))
  if (n >= ladder) return n
  if (isLegacyUnsetMaxTokens(n, ladder)) return ladder
  return n
}
