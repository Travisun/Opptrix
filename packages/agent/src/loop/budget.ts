/**
 * Agent 聊天循环安全预算（A：对齐 Cursor 丝滑度；末轮对齐 OpenCode last-step 禁工具）。
 * `OPPTRIX_AGENT_CURSOR_SMOOTH=0` 时回退现网数值。
 */

export function isAgentCursorSmoothEnabled(): boolean {
  return process.env.OPPTRIX_AGENT_CURSOR_SMOOTH !== '0'
}

/** 强制停机轮数（0-based loop 上界：round < MAX）；smooth 对齐 Cursor maxSteps≈512，产品上限 550 */
export function resolveMaxSafetyRounds(): number {
  return isAgentCursorSmoothEnabled() ? 550 : 50
}

/**
 * 是否为本轮安全预算的最后一步（0-based `round`）。
 * 末轮须 `toolChoice:'none'`（或空 tools）并注入 {@link LAST_STEP_TURN_TAIL}。
 */
export function isLastSafetyRound(round: number, maxSafetyRounds = resolveMaxSafetyRounds()): boolean {
  if (!Number.isFinite(round) || !Number.isFinite(maxSafetyRounds)) return false
  if (maxSafetyRounds <= 0) return true
  return round >= maxSafetyRounds - 1
}

/**
 * 软提醒阈值（1-based 轮次）：≥ 此值注入一次 turn-tail。
 * 回退模式下不注入。
 */
export function resolveSoftRemindRound(): number | null {
  return isAgentCursorSmoothEnabled() ? 400 : null
}

/** 仅注入模型 turn-tail；禁止用户 UI「第 N 步」 */
export const SOFT_REMIND_TURN_TAIL =
  '【进度提醒】本轮已进行较久，可继续取证或整理已有材料成稿；优先收束结论，勿为堆砌而重复同一查询。'

/** 末步收束：仅注入模型 turn-tail；配合 tool_choice=none */
export const LAST_STEP_TURN_TAIL =
  '【收束】这是本轮最后一步：请基于已有工具结果整理最终答复，禁止再调用任何工具。'

/**
 * 可选 doom-loop 守卫（默认关）。同 fingerprint 连续命中次数 ≥ 阈值时可触发确认。
 * 完整钩子见 `doom-loop.ts`；开启：`OPPTRIX_AGENT_DOOM_LOOP=1`。
 */
export const DOOM_LOOP_ENABLED_DEFAULT = false
export const DOOM_LOOP_REPEAT_THRESHOLD = 3

export function isDoomLoopEnabled(): boolean {
  return process.env.OPPTRIX_AGENT_DOOM_LOOP === '1'
}

/** 安全上限停机：中性文案，无步数焦虑 */
export const SAFETY_STOP_REPLY_SMOOTH =
  '本轮研究已较长，已先收束；你可继续追问深化。'

export const SAFETY_STOP_REPLY_LEGACY =
  '⚠️ 分析轮次过多，请简化问题或明确分析方向后重试。'

export function resolveSafetyStopReply(): string {
  return isAgentCursorSmoothEnabled()
    ? SAFETY_STOP_REPLY_SMOOTH
    : SAFETY_STOP_REPLY_LEGACY
}
