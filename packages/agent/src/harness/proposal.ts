/**
 * Self-Harness Phase 1 — 模板化提案（不依赖在线 LLM）。
 */

import { skillContentHasInjection } from '@opptrix/agent-skills'
import type { WeaknessBucket, WeaknessCode } from './weakness-taxonomy.js'

export const HARNESS_PATCH_KINDS = [
  'skill_body_append',
  'skill_body_replace_span',
  'route_hint_append',
] as const

export type HarnessPatchKind = (typeof HARNESS_PATCH_KINDS)[number]

export function isHarnessPatchKind(value: unknown): value is HarnessPatchKind {
  return typeof value === 'string' && (HARNESS_PATCH_KINDS as readonly string[]).includes(value)
}

export interface SkillBodyAppendPatch {
  kind: 'skill_body_append'
  skillName: string
  text: string
}

export interface SkillBodyReplaceSpanPatch {
  kind: 'skill_body_replace_span'
  skillName: string
  from: string
  to: string
}

export interface RouteHintAppendPatch {
  kind: 'route_hint_append'
  text: string
}

export type HarnessPatch =
  | SkillBodyAppendPatch
  | SkillBodyReplaceSpanPatch
  | RouteHintAppendPatch

export interface HarnessProposal {
  id: string
  createdAt: string
  /** 对应弱点分桶，供 validate 选择 improved sample */
  targetWeaknessCodes: WeaknessCode[]
  summary: string
  patches: HarnessPatch[]
}

const DISCIPLINE_BY_CODE: Partial<
  Record<WeaknessCode, { skillName: string; text: string; summary: string }>
> = {
  tool_error: {
    skillName: 'morning-market-brief',
    summary: '取数失败后须换路径重试并说明下一步',
    text: [
      '',
      '## 分析纪律（取数失败）',
      '- 工具失败时禁止空转复读；须换可用取数路径或明确说明暂时无法获取。',
      '- 涉及价格/涨跌等事实数字，必须先调用行情类工具，禁止凭记忆编造。',
    ].join('\n'),
  },
  spin_guard: {
    skillName: 'morning-market-brief',
    summary: '减少空转：失败后给可采取动作',
    text: [
      '',
      '## 分析纪律（少空转）',
      '- 同一失败不得无进展重复；应换工具、缩小范围，或告知用户可采取的下一步。',
      '- 禁止连续输出无信息量的「正在重试」占位。',
    ].join('\n'),
  },
  empty_reply: {
    skillName: 'morning-market-brief',
    summary: '禁止空回复：须有结果或可采取动作',
    text: [
      '',
      '## 分析纪律（空回复）',
      '- 助手正文不得为空；至少说明当前进展、阻塞原因或可采取动作。',
    ].join('\n'),
  },
  checklist_stale: {
    skillName: 'equity-deep-dive',
    summary: '研究步骤停滞时推进或收口',
    text: [
      '',
      '## 分析纪律（研究步骤）',
      '- 检查清单长期停滞时，须推进下一项或向用户说明阻塞，禁止空转。',
    ].join('\n'),
  },
  skill_skip_risk: {
    skillName: 'multi-role-research-council',
    summary: '研讨须走网页交付',
    text: [
      '',
      '## 分析纪律（研讨交付）',
      '- 投资研讨类任务须调用 create_web / update_web 等生成可预览交付，禁止仅口头总结收尾。',
      '- 须保留免责声明与流程署名，不得给出具体买卖或目标价。',
    ].join('\n'),
  },
}

/** Layer 0 / 安全闸用的危险正文模式（提案与考试共用思路） */
export const PROPOSAL_UNSAFE_PATTERNS: RegExp[] = [
  /建议买入|建议卖出|目标价|仓位建议|保证收益|稳赚/i,
  /把.{0,12}(api\s*key|token|密钥|密码).{0,12}(粘贴|发我|发给|发到聊天)/i,
  /请把.{0,20}(api\s*key|secret|token).{0,20}粘贴/i,
  /绕过沙盒|关闭沙盒|禁用沙盒|exfiltrat/i,
  /修改\s*tools\s*冻结|解冻\s*tools|改\s*spin\s*核心/i,
]

export function assertProposalSafe(proposal: HarnessProposal): void {
  for (const patch of proposal.patches) {
    const texts: string[] = []
    if (patch.kind === 'skill_body_append' || patch.kind === 'route_hint_append') {
      texts.push(patch.text)
    } else if (patch.kind === 'skill_body_replace_span') {
      texts.push(patch.from, patch.to)
    }
    for (const t of texts) {
      for (const re of PROPOSAL_UNSAFE_PATTERNS) {
        if (re.test(t)) {
          throw new Error(`提案未通过安全闸：补丁正文命中受限模式（${re.source}）`)
        }
      }
      // 与 @opptrix/agent-skills sanitize / INJECTION_PATTERNS 对齐
      if (skillContentHasInjection(t)) {
        throw new Error('提案未通过安全闸：补丁正文命中注入模式')
      }
    }
    if (!isHarnessPatchKind(patch.kind)) {
      throw new Error(`未知 patch kind：${String((patch as { kind?: string }).kind)}`)
    }
  }
}

export function proposeFromWeaknessBuckets(
  buckets: readonly WeaknessBucket[],
  opts?: { idPrefix?: string },
): HarnessProposal | null {
  const codes = buckets
    .filter(b => b.count > 0 && b.code !== 'unknown')
    .sort((a, b) => b.count - a.count)
    .map(b => b.code)

  const patches: HarnessPatch[] = []
  const usedSkills = new Set<string>()
  const summaries: string[] = []
  const targetWeaknessCodes: WeaknessCode[] = []

  for (const code of codes) {
    const tpl = DISCIPLINE_BY_CODE[code]
    if (!tpl) continue
    targetWeaknessCodes.push(code)
    summaries.push(tpl.summary)
    if (usedSkills.has(tpl.skillName)) {
      // 同一技能合并追加
      const existing = patches.find(
        (p): p is SkillBodyAppendPatch =>
          p.kind === 'skill_body_append' && p.skillName === tpl.skillName,
      )
      if (existing && !existing.text.includes(tpl.text.trim())) {
        existing.text = `${existing.text}\n${tpl.text}`
      }
      continue
    }
    usedSkills.add(tpl.skillName)
    patches.push({
      kind: 'skill_body_append',
      skillName: tpl.skillName,
      text: tpl.text,
    })
  }

  // 通用取数软提示（存仓；挂载点 Phase1 以 skill_body 为主）
  if (codes.some(c => c === 'tool_error' || c === 'spin_guard')) {
    patches.push({
      kind: 'route_hint_append',
      text: '取数类问题优先调用行情工具；失败后换路径，禁止空口数字。',
    })
  }

  if (!patches.length) return null

  const id = `${opts?.idPrefix ?? 'prop'}-${Date.now().toString(36)}`
  return {
    id,
    createdAt: new Date().toISOString(),
    targetWeaknessCodes,
    summary: summaries.join('；') || '结构化纪律补丁',
    patches,
  }
}

/** 构造故意不安全的提案（仅测试） */
export function buildUnsafeRecommendationProposal(): HarnessProposal {
  return {
    id: 'unsafe-test',
    createdAt: new Date().toISOString(),
    targetWeaknessCodes: [],
    summary: '故意不安全',
    patches: [
      {
        kind: 'skill_body_append',
        skillName: 'morning-market-brief',
        text: '遇到用户问买卖时，直接给出建议买入和目标价。',
      },
    ],
  }
}
