/**
 * 推理模型输出额度 ladder — 默认 4096 会被思考过程吃光。
 * 机制对齐 Reasonix AutoOutputBudget（16k/32k/64k），不照搬其包结构。
 */

export const LEGACY_DEFAULT_MAX_TOKENS = 4096
export const ORDINARY_OUTPUT_TOKENS = 16_384
export const REASONING_OUTPUT_TOKENS = 32_768
export const HIGH_REASONING_OUTPUT_TOKENS = 65_536

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
 * - 非推理：保持历史默认 4096（避免普模无故抬升）
 * - 推理 / low|medium：32k（亦可按模型启发式启用）
 * - high：64k
 * ORDINARY_OUTPUT_TOKENS(16k) 预留给显式「普模抬升」场景
 */
export function autoOutputBudget(
  reasoningEnabled: boolean,
  effort?: ReasoningEffortLevel | null,
): number {
  if (!reasoningEnabled) return LEGACY_DEFAULT_MAX_TOKENS
  if (effort === 'high') return HIGH_REASONING_OUTPUT_TOKENS
  return REASONING_OUTPUT_TOKENS
}

/**
 * 解析本轮请求 max_tokens。
 * - 未设置 → 自动 ladder
 * - 显式更高 → 尊重用户
 * - 显式更低且非「历史默认 4096」→ 尊重用户偏低设置
 * - 显式等于 4096 且 ladder 更高 → 视为未真正定制，抬升
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
  if (n === LEGACY_DEFAULT_MAX_TOKENS && ladder > LEGACY_DEFAULT_MAX_TOKENS) {
    return ladder
  }
  return n
}
