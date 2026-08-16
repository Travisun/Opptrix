/**
 * Self-Harness Phase 1–3 — 一站式离线实验室入口（不进 engine.chat）。
 */

import { buildWeaknessReport, type BuildWeaknessReportInput, type WeaknessReport } from './weakness-report.js'
import {
  proposeFromWeaknessBuckets,
  type HarnessProposal,
} from './proposal.js'
import { validateProposalAgainstHeldOut, type ValidateProposalResult } from './validate-proposal.js'
import { judgeExamSuite } from './exam-judge.js'
import { listHarnessExams } from './exams/fixtures.js'
import {
  appendHarnessAudit,
  classifyVersionTier,
  isHarnessAutoPromoteEnabled,
  promoteHarnessProposal,
  type HarnessVersionRecord,
} from './local-store.js'

export interface RunHarnessLabInput {
  /** 可选：离线弱点报告输入；与 report 二选一 */
  reportInput?: BuildWeaknessReportInput
  /** 已有弱点报告 */
  report?: WeaknessReport
  /** 直接指定提案（跳过从弱点生成） */
  proposal?: HarnessProposal
  /**
   * 验证通过后写入本地仓。
   * `true` === `'manual'`（兼容 Phase1）；`'auto'` 仅 A 级且开关开。
   */
  promote?: boolean | 'manual' | 'auto'
  /** 同时跑 held-in 基线样本（诊断用） */
  includeHeldIn?: boolean
  /** 自动/人工晋升写入的模型桶；默认 '*' */
  modelBucket?: string
}

export interface RunHarnessLabResult {
  report: WeaknessReport | null
  proposal: HarnessProposal | null
  validation: ValidateProposalResult | null
  heldIn?: { passCount: number; totalScore: number; examCount: number }
  promoted: HarnessVersionRecord | null
  /** auto 路径跳过原因（关停 / 非 A / 验证失败等） */
  skipReason?: string
}

/**
 * 离线：弱点 → 模板提案 → held-out 验证 →（可选）promote。
 * **禁止**从 engine.chat 调用。
 */
export function runHarnessLab(input: RunHarnessLabInput = {}): RunHarnessLabResult {
  let report = input.report ?? null
  if (!report && input.reportInput) {
    report = buildWeaknessReport(input.reportInput)
  }

  let proposal = input.proposal ?? null
  if (!proposal && report) {
    proposal = proposeFromWeaknessBuckets(report.weaknesses)
  }

  let validation: ValidateProposalResult | null = null
  let promoted: HarnessVersionRecord | null = null
  let skipReason: string | undefined

  const promoteMode =
    input.promote === true
      ? 'manual'
      : input.promote === false || input.promote == null
        ? null
        : input.promote

  if (proposal) {
    validation = validateProposalAgainstHeldOut(proposal)
    if (promoteMode && validation.ok && !validation.safetyVeto) {
      const modelBucket = input.modelBucket
      if (promoteMode === 'auto') {
        if (!isHarnessAutoPromoteEnabled()) {
          skipReason = 'auto_promote_disabled'
          appendHarnessAudit({
            action: 'skip_auto_promote',
            modelRef: modelBucket,
            detail: skipReason,
          })
        } else {
          const tier = classifyVersionTier(proposal.patches)
          if (tier !== 'A') {
            skipReason = `tier_${tier}_not_auto`
            appendHarnessAudit({
              action: 'skip_auto_promote',
              modelRef: modelBucket,
              detail: skipReason,
            })
          } else {
            promoted = promoteHarnessProposal(proposal, {
              source: 'auto',
              modelBucket,
            })
          }
        }
      } else {
        promoted = promoteHarnessProposal(proposal, {
          source: 'manual',
          modelBucket,
        })
      }
    } else if (promoteMode === 'auto' && proposal) {
      skipReason =
        validation?.safetyVeto
          ? 'safety_veto'
          : validation && !validation.ok
            ? 'validation_failed'
            : 'unknown'
      appendHarnessAudit({
        action: 'skip_auto_promote',
        modelRef: input.modelBucket,
        detail: skipReason,
      })
    }
  }

  let heldIn: RunHarnessLabResult['heldIn']
  if (input.includeHeldIn) {
    const exams = listHarnessExams('held_in')
    const suite = judgeExamSuite(exams, e => e.samples.baseline)
    heldIn = {
      passCount: suite.passCount,
      totalScore: suite.totalScore,
      examCount: exams.length,
    }
  }

  return { report, proposal, validation, heldIn, promoted, skipReason }
}
