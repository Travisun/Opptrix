/**
 * 会话工作记忆 — 结构化压缩后的投研上下文。
 * Display transcript（turns）不变；ModelView 注入本结构。
 */

export interface SessionMemory {
  /** 用户原始诉求 / 当前阶段目标（神圣，压缩时禁止省略） */
  goal: string
  /** 约束：市场范围、时间、红线等 */
  constraints: string
  /** 标的、行业、关键事件 */
  entities: string
  /** 已取证结论 */
  facts: string
  /** 用户确认过的偏好 */
  decisions: string
  /** 未决问题 */
  openQuestions: string
  /** 已否证假设 */
  rejected: string
  /** 下一轮应继续什么 */
  workingState: string
  updatedAt: string
  /** 生成该摘要时已覆盖的 messages 条数（近似水位） */
  sourceMessageCount: number
  compactVersion: number
}

export function emptySessionMemory(partial?: Partial<SessionMemory>): SessionMemory {
  return {
    goal: '',
    constraints: '',
    entities: '',
    facts: '',
    decisions: '',
    openQuestions: '',
    rejected: '',
    workingState: '',
    updatedAt: new Date().toISOString(),
    sourceMessageCount: 0,
    compactVersion: 1,
    ...partial,
  }
}

export function formatSessionMemoryForPrompt(memory: SessionMemory | null | undefined): string | null {
  if (!memory) return null
  const sections: Array<[string, string]> = [
    ['目标（必须遵守）', memory.goal],
    ['约束', memory.constraints],
    ['标的与实体', memory.entities],
    ['已确认事实', memory.facts],
    ['已做决定', memory.decisions],
    ['未决问题', memory.openQuestions],
    ['已否证', memory.rejected],
    ['当前进度', memory.workingState],
  ]
  const body = sections
    .filter(([, v]) => v.trim())
    .map(([k, v]) => `### ${k}\n${v.trim()}`)
    .join('\n\n')
  if (!body.trim()) return null
  return [
    '【会话工作记忆 — 较早对话已整理；须延续目标与约束，勿遗忘标的与结论】',
    body,
  ].join('\n\n')
}

/** 压缩后工作记忆：用 user 尾块注入，避免第二条 role:system 破坏前缀缓存 */
export function sessionMemoryAsUserBlock(memory: SessionMemory | null | undefined): string | null {
  return formatSessionMemoryForPrompt(memory)
}

export function parseSessionMemoryFromModelText(
  raw: string,
  prev: SessionMemory | null | undefined,
  sourceMessageCount: number,
): SessionMemory {
  const text = raw.replace(/\r\n/g, '\n').trim()
  const pick = (label: string): string => {
    const re = new RegExp(
      `(?:^|\\n)(?:#+\\s*)?${label}\\s*[:：]?\\s*\\n([\\s\\S]*?)(?=\\n(?:#+\\s*)?(?:目标|约束|标的|实体|事实|决定|未决|否证|进度|Goal|Constraints|Entities|Facts|Decisions|Open|Rejected|Working)\\b|$)`,
      'i',
    )
    const m = text.match(re)
    return m?.[1]?.trim() ?? ''
  }

  const goal = pick('目标') || pick('Goal') || prev?.goal || ''
  const constraints = pick('约束') || pick('Constraints') || prev?.constraints || ''
  const entities = pick('标的与实体') || pick('标的') || pick('实体') || pick('Entities') || prev?.entities || ''
  const facts = pick('已确认事实') || pick('事实') || pick('Facts') || prev?.facts || ''
  const decisions = pick('已做决定') || pick('决定') || pick('Decisions') || prev?.decisions || ''
  const openQuestions = pick('未决问题') || pick('未决') || pick('Open') || prev?.openQuestions || ''
  const rejected = pick('已否证') || pick('否证') || pick('Rejected') || prev?.rejected || ''
  const workingState = pick('当前进度') || pick('进度') || pick('Working') || prev?.workingState || ''

  return emptySessionMemory({
    goal: goal || prev?.goal || '（未提取到明确目标，请根据最近用户消息推断并延续）',
    constraints,
    entities,
    facts,
    decisions,
    openQuestions,
    rejected,
    workingState,
    sourceMessageCount,
    compactVersion: (prev?.compactVersion ?? 0) + 1,
  })
}

export const STRUCTURED_COMPACT_SYSTEM = [
  '你是会话上下文整理器。将对话历史压缩为结构化工作记忆。',
  '必须保留：用户目标原文要点、约束、标的代码/名称、已确认数字与结论（带来源简述）、未决问题。',
  '可丢弃：冗长行情表、重复工具 JSON、已过期探索分支。',
  '禁止编造事实；不确定处写「不确定」。',
  '只输出以下 Markdown 分区（中文标题），不要寒暄：',
  '## 目标',
  '## 约束',
  '## 标的与实体',
  '## 已确认事实',
  '## 已做决定',
  '## 未决问题',
  '## 已否证',
  '## 当前进度',
].join('\n')
