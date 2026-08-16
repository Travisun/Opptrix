/**
 * Self-Harness Phase 1 — 对 baseline + proposal 跑 held-out；返回 pass/fail + scores。
 */

import { judgeExamSuite } from './exam-judge.js'
import { listHarnessExams } from './exams/fixtures.js'
import type { ExamRunTrace, HarnessExam } from './exam-types.js'
import {
  assertProposalSafe,
  type HarnessProposal,
} from './proposal.js'
import type { WeaknessCode } from './weakness-taxonomy.js'

export interface ValidateProposalResult {
  ok: boolean
  safetyVeto: boolean
  safetyError?: string
  baseline: { passCount: number; totalScore: number; examCount: number }
  withProposal: { passCount: number; totalScore: number; examCount: number }
  heldOutExamIds: string[]
  notes: string[]
}

const CATEGORY_TO_CODES: Record<string, WeaknessCode[]> = {
  data_fetch: ['tool_error'],
  spin_guard: ['spin_guard', 'empty_reply', 'tool_error'],
  seminar_delivery: ['skill_skip_risk', 'checklist_stale'],
  safety: [],
  /** 协作去重 / 收口：映射空转与交付缺口启发式 */
  collaboration: ['spin_guard', 'skill_skip_risk', 'checklist_stale'],
}

function proposalRelevant(exam: HarnessExam, proposal: HarnessProposal): boolean {
  const codes = new Set(proposal.targetWeaknessCodes)
  const mapped = CATEGORY_TO_CODES[exam.category] ?? []
  if (exam.category === 'safety') {
    // 安全题：好提案应使用 improved（合规回复）；坏提案在 assert 阶段已拦截
    return true
  }
  return mapped.some(c => codes.has(c))
}

function pickRun(
  exam: HarnessExam,
  mode: 'baseline' | 'proposal',
  proposal: HarnessProposal | null,
): ExamRunTrace {
  if (mode === 'baseline') return exam.samples.baseline
  if (!proposal) return exam.samples.baseline
  return proposalRelevant(exam, proposal) ? exam.samples.improved : exam.samples.baseline
}

/**
 * 在 held-out 上对比 baseline 与提案；好提案不得退步；不安全提案一票否决。
 */
export function validateProposalAgainstHeldOut(
  proposal: HarnessProposal,
): ValidateProposalResult {
  const notes: string[] = []
  try {
    assertProposalSafe(proposal)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return {
      ok: false,
      safetyVeto: true,
      safetyError: msg,
      baseline: { passCount: 0, totalScore: 0, examCount: 0 },
      withProposal: { passCount: 0, totalScore: 0, examCount: 0 },
      heldOutExamIds: [],
      notes: [msg],
    }
  }

  const heldOut = listHarnessExams('held_out')
  const baselineSuite = judgeExamSuite(heldOut, e => pickRun(e, 'baseline', null))
  const proposalSuite = judgeExamSuite(heldOut, e => pickRun(e, 'proposal', proposal))

  if (proposalSuite.safetyVeto) {
    notes.push('held-out 出现安全一票否决')
  }

  const noRegress =
    proposalSuite.totalScore >= baselineSuite.totalScore
    && proposalSuite.passCount >= baselineSuite.passCount
    && !proposalSuite.safetyVeto

  if (!noRegress) {
    notes.push(
      `held-out 退步或否决：baseline score=${baselineSuite.totalScore}/pass=${baselineSuite.passCount} → proposal score=${proposalSuite.totalScore}/pass=${proposalSuite.passCount}`,
    )
  } else {
    notes.push('held-out 未退步且无安全否决')
  }

  return {
    ok: noRegress,
    safetyVeto: proposalSuite.safetyVeto,
    baseline: {
      passCount: baselineSuite.passCount,
      totalScore: baselineSuite.totalScore,
      examCount: heldOut.length,
    },
    withProposal: {
      passCount: proposalSuite.passCount,
      totalScore: proposalSuite.totalScore,
      examCount: heldOut.length,
    },
    heldOutExamIds: heldOut.map(e => e.id),
    notes,
  }
}
