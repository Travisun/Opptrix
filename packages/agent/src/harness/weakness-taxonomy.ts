/**
 * Self-Harness Phase 0 — 失败类型分类（只读、固定集合，可扩展）。
 * 不在 engine.chat 热路径调用；Phase 1 再接线离线流水线。
 */

/** 弱点代码 — 固定枚举，新增须同步测试与 SELF-HARNESS-PRODUCT.md */
export type WeaknessCode =
  | 'tool_error'
  | 'spin_guard'
  | 'empty_reply'
  | 'checklist_stale'
  | 'skill_skip_risk'
  | 'unknown'

export type WeaknessConfidence = 'high' | 'medium' | 'low'

export interface WeaknessEvidence {
  tool?: string
  label?: string
  snippet?: string
}

export interface WeaknessBucket {
  code: WeaknessCode
  count: number
  evidence: WeaknessEvidence[]
  confidence: WeaknessConfidence
}

/** 产品向中文标签（研发报告用，不对终端用户展示） */
export const WEAKNESS_LABELS: Record<WeaknessCode, string> = {
  tool_error: '工具执行失败',
  spin_guard: '空转拦截',
  empty_reply: '助手空回复',
  checklist_stale: '研究步骤停滞',
  skill_skip_risk: '技能交付缺口（启发式）',
  unknown: '未分类异常',
}

const CONFIDENCE_RANK: Record<WeaknessConfidence, number> = {
  low: 0,
  medium: 1,
  high: 2,
}

export function maxWeaknessConfidence(
  a: WeaknessConfidence,
  b: WeaknessConfidence,
): WeaknessConfidence {
  return CONFIDENCE_RANK[a] >= CONFIDENCE_RANK[b] ? a : b
}
