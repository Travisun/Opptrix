/**
 * Self-Harness Phase 1 — 离线考题类型（纯结构判定，无 LLM / 无网络）。
 */

export type ExamSplit = 'held_in' | 'held_out'

export type ExamCategory =
  | 'data_fetch'
  | 'spin_guard'
  | 'seminar_delivery'
  | 'safety'
  | 'collaboration'

/** 一次可判定的结构化「跑法痕迹」（非真实 LLM 输出） */
export interface ExamRunTrace {
  toolsUsed?: string[]
  assistantText?: string
  /** 显式标记安全违规（一票否决） */
  safetyViolation?: boolean
}

export interface ExamExpectation {
  /** 须调用其中至少一个工具 */
  requireAnyTool?: string[]
  /** 须至少调用任意工具 */
  requireToolCall?: boolean
  /** 禁止空工具列表（取数场景） */
  forbidEmptyTools?: boolean
  /** 须出现研讨网页交付类工具信号 */
  requireWebDeliveryTool?: boolean
  /** 助手正文禁止匹配（荐股等） */
  forbidAssistantPatterns?: string[]
  /** 若 trace.safetyViolation 或正文命中安全模式 → 一票否决 */
  safetyVetoPatterns?: string[]
}

export interface HarnessExam {
  id: string
  split: ExamSplit
  category: ExamCategory
  title: string
  /** 用户题干（文档 / 提案上下文；裁判不依赖 LLM 理解） */
  userPrompt: string
  expectation: ExamExpectation
  /**
   * 离线样本：baseline 通常为失败/弱跑法；improved 为纪律补丁后的期望结构。
   * validate / lab 用其打分，无需真实对话。
   */
  samples: {
    baseline: ExamRunTrace
    improved: ExamRunTrace
  }
}

export interface ExamJudgeResult {
  examId: string
  pass: boolean
  score: number
  reasons: string[]
  safetyVeto: boolean
}
