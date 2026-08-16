/**
 * Self-Harness Phase 0 — 从会话 turns / tool_steps 生成弱点聚合报告（纯函数）。
 *
 * 默认不在 engine.chat 中调用；Phase 1 再接入离线 Harness 流水线。
 */

import type { ChatToolStep } from '../chat-progress.js'
import type { ResearchChecklistItem } from '../loop/research-checklist.js'
import {
  maxWeaknessConfidence,
  WEAKNESS_LABELS,
  type WeaknessBucket,
  type WeaknessCode,
  type WeaknessConfidence,
  type WeaknessEvidence,
} from './weakness-taxonomy.js'

const SNIPPET_MAX = 120
const EVIDENCE_MAX_PER_BUCKET = 10

const SEMINAR_SKILL_PATTERN =
  /multi-role|research-council|投资研讨|研讨团|多空辩论|research.council/i

const WEB_DELIVERY_TOOLS = new Set([
  'create_web',
  'update_web',
  'read_web',
  'export_web_preview',
])

export interface WeaknessReportTurn {
  role: 'user' | 'assistant'
  content: string
  toolsUsed?: string[]
  toolSteps?: ChatToolStep[]
  at?: string
}

export interface BuildWeaknessReportInput {
  sessionId?: string
  modelRef?: string
  turns: WeaknessReportTurn[]
  /** 可选：传入 checklist 快照时才检测 checklist_stale */
  checklist?: ResearchChecklistItem[]
  /** 可选：已激活技能名，用于 skill_skip_risk 启发式 */
  activatedSkills?: readonly string[]
}

export interface WeaknessReport {
  sessionId?: string
  modelRef?: string
  generatedAt: string
  weaknesses: WeaknessBucket[]
  byModel?: Record<string, WeaknessBucket[]>
  totals: {
    weaknessCount: number
    turnCount: number
    assistantTurnCount: number
  }
}

type RawFinding = {
  code: WeaknessCode
  confidence: WeaknessConfidence
  evidence: WeaknessEvidence
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value)
}

function tryParseJson(text: string): Record<string, unknown> | null {
  const trimmed = text.trim()
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return null
  try {
    const parsed: unknown = JSON.parse(trimmed)
    return isRecord(parsed) ? parsed : null
  } catch {
    return null
  }
}

/** 脱敏截断：不含密钥正文、绝对路径等敏感内容 */
export function sanitizeWeaknessSnippet(raw: string): string {
  let s = raw.replace(/\s+/g, ' ').trim()
  s = s.replace(
    /(?:sk-[A-Za-z0-9_-]{8,}|(?:api[_-]?key|token|secret|password|authorization)\s*[:=]\s*[\w.-]{6,})/gi,
    '[已脱敏]',
  )
  s = s.replace(
    /(?:\/Users\/|\/home\/|\/var\/|C:\\|D:\\|E:\\)[^\s,;'"`]+/gi,
    '[路径已隐藏]',
  )
  s = s.replace(/~\/[^\s,;'"`]+/g, '[路径已隐藏]')
  if (s.length > SNIPPET_MAX) {
    return `${s.slice(0, SNIPPET_MAX)}…`
  }
  return s
}

function stepTextFields(step: ChatToolStep): string[] {
  return [step.resultPreview, step.resultDetail, step.label, step.argsPreview]
    .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
}

function parsedFields(step: ChatToolStep): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = []
  for (const field of [step.resultPreview, step.resultDetail]) {
    if (!field) continue
    const parsed = tryParseJson(field)
    if (parsed) out.push(parsed)
  }
  return out
}

function stepHasSpinGuard(step: ChatToolStep): boolean {
  for (const parsed of parsedFields(step)) {
    if (parsed.spin_guard === true) return true
  }
  for (const text of stepTextFields(step)) {
    if (/"spin_guard"\s*:\s*true/.test(text)) return true
  }
  return false
}

function stepHasToolError(step: ChatToolStep): boolean {
  if (stepHasSpinGuard(step)) return false
  if (step.status === 'error') return true
  for (const parsed of parsedFields(step)) {
    if (typeof parsed.error === 'string' && parsed.error.trim()) return true
    if (parsed.success === false) return true
    if (parsed.ok === false) return true
  }
  return false
}

function evidenceFromStep(
  step: ChatToolStep,
  fallbackSnippet: string,
): WeaknessEvidence {
  const snippetSource =
    step.resultPreview
    ?? step.resultDetail
    ?? step.label
    ?? fallbackSnippet
  return {
    tool: step.tool,
    label: step.label ? sanitizeWeaknessSnippet(step.label) : undefined,
    snippet: sanitizeWeaknessSnippet(snippetSource),
  }
}

function collectToolStepFindings(turn: WeaknessReportTurn): RawFinding[] {
  const findings: RawFinding[] = []
  for (const step of turn.toolSteps ?? []) {
    if (stepHasSpinGuard(step)) {
      findings.push({
        code: 'spin_guard',
        confidence: 'high',
        evidence: evidenceFromStep(step, 'spin_guard'),
      })
      continue
    }
    if (stepHasToolError(step)) {
      findings.push({
        code: 'tool_error',
        confidence: step.status === 'error' ? 'high' : 'medium',
        evidence: evidenceFromStep(step, 'tool_error'),
      })
    }
  }
  return findings
}

function collectEmptyReplyFinding(turn: WeaknessReportTurn): RawFinding | null {
  if (turn.role !== 'assistant') return null
  const content = turn.content.trim()
  const hasSteps = (turn.toolSteps?.length ?? 0) > 0
  if (content || hasSteps) return null
  return {
    code: 'empty_reply',
    confidence: 'high',
    evidence: {
      snippet: sanitizeWeaknessSnippet('助手轮次无正文且无工具步骤'),
    },
  }
}

function parseChecklistPendingCount(result: unknown): number | null {
  if (!isRecord(result)) return null
  const pending = result.pending_count
  return typeof pending === 'number' && Number.isFinite(pending) ? pending : null
}

function collectChecklistStaleFinding(
  turns: WeaknessReportTurn[],
  checklist: ResearchChecklistItem[] | undefined,
): RawFinding | null {
  if (!checklist?.length) return null
  const pendingItems = checklist.filter(i => i.status === 'pending')
  if (!pendingItems.length) return null

  let sawChecklistTool = false
  let lastPendingCount: number | null = null
  for (const turn of turns) {
    for (const step of turn.toolSteps ?? []) {
      if (step.tool !== 'update_research_checklist') continue
      sawChecklistTool = true
      for (const parsed of parsedFields(step)) {
        const pending = parseChecklistPendingCount(parsed)
        if (pending != null) lastPendingCount = pending
      }
    }
  }

  const hasProgressSignal =
    sawChecklistTool
    && lastPendingCount != null
    && lastPendingCount < pendingItems.length

  if (hasProgressSignal) return null

  const titles = pendingItems.slice(0, 3).map(i => i.title).join('、')
  return {
    code: 'checklist_stale',
    confidence: sawChecklistTool ? 'medium' : 'high',
    evidence: {
      tool: 'update_research_checklist',
      label: '研究步骤未完成',
      snippet: sanitizeWeaknessSnippet(
        pendingItems.length > 3
          ? `${titles} 等 ${pendingItems.length} 项仍待完成`
          : `${titles} 仍待完成`,
      ),
    },
  }
}

function inferActivatedSkills(
  turns: WeaknessReportTurn[],
  activatedSkills: readonly string[] | undefined,
): string[] {
  const names = new Set<string>()
  for (const name of activatedSkills ?? []) {
    const trimmed = name.trim()
    if (trimmed) names.add(trimmed)
  }
  for (const turn of turns) {
    for (const step of turn.toolSteps ?? []) {
      if (step.tool !== 'activate_agent_skill') continue
      const parsedArgs = step.argsPreview ? tryParseJson(step.argsPreview) : null
      const rawNames = parsedArgs?.skill_names ?? parsedArgs?.skills ?? parsedArgs?.names
      if (Array.isArray(rawNames)) {
        for (const item of rawNames) {
          if (typeof item === 'string' && item.trim()) names.add(item.trim())
        }
      } else if (typeof rawNames === 'string' && rawNames.trim()) {
        names.add(rawNames.trim())
      }
    }
  }
  return [...names]
}

function sessionUsedWebDelivery(turns: WeaknessReportTurn[]): boolean {
  for (const turn of turns) {
    for (const tool of turn.toolsUsed ?? []) {
      if (WEB_DELIVERY_TOOLS.has(tool)) return true
    }
    for (const step of turn.toolSteps ?? []) {
      if (WEB_DELIVERY_TOOLS.has(step.tool)) return true
    }
  }
  return false
}

function collectSkillSkipRiskFinding(
  turns: WeaknessReportTurn[],
  activatedSkills: readonly string[] | undefined,
): RawFinding | null {
  const skills = inferActivatedSkills(turns, activatedSkills)
  const seminarSkills = skills.filter(name => SEMINAR_SKILL_PATTERN.test(name))
  if (!seminarSkills.length) return null
  if (sessionUsedWebDelivery(turns)) return null

  return {
    code: 'skill_skip_risk',
    confidence: 'medium',
    evidence: {
      tool: 'activate_agent_skill',
      label: '研讨类技能已激活',
      snippet: sanitizeWeaknessSnippet(
        `已激活 ${seminarSkills.join('、')}，但未检测到网页交付工具（create_web 等）`,
      ),
    },
  }
}

function aggregateFindings(findings: RawFinding[]): WeaknessBucket[] {
  const map = new Map<WeaknessCode, WeaknessBucket>()
  for (const finding of findings) {
    const existing = map.get(finding.code)
    if (!existing) {
      map.set(finding.code, {
        code: finding.code,
        count: 1,
        evidence: [finding.evidence],
        confidence: finding.confidence,
      })
      continue
    }
    existing.count += 1
    existing.confidence = maxWeaknessConfidence(existing.confidence, finding.confidence)
    if (existing.evidence.length < EVIDENCE_MAX_PER_BUCKET) {
      existing.evidence.push(finding.evidence)
    }
  }
  return [...map.values()].sort((a, b) => b.count - a.count || a.code.localeCompare(b.code))
}

/**
 * 从会话 turns 构建弱点报告（纯函数，无副作用）。
 */
export function buildWeaknessReport(input: BuildWeaknessReportInput): WeaknessReport {
  const turns = input.turns ?? []
  const findings: RawFinding[] = []

  for (const turn of turns) {
    findings.push(...collectToolStepFindings(turn))
    const emptyReply = collectEmptyReplyFinding(turn)
    if (emptyReply) findings.push(emptyReply)
  }

  const checklistStale = collectChecklistStaleFinding(turns, input.checklist)
  if (checklistStale) findings.push(checklistStale)

  const skillSkip = collectSkillSkipRiskFinding(turns, input.activatedSkills)
  if (skillSkip) findings.push(skillSkip)

  const weaknesses = aggregateFindings(findings)
  const weaknessCount = weaknesses.reduce((sum, bucket) => sum + bucket.count, 0)
  const assistantTurnCount = turns.filter(t => t.role === 'assistant').length

  const report: WeaknessReport = {
    sessionId: input.sessionId,
    modelRef: input.modelRef,
    generatedAt: new Date().toISOString(),
    weaknesses,
    totals: {
      weaknessCount,
      turnCount: turns.length,
      assistantTurnCount,
    },
  }

  if (input.modelRef) {
    report.byModel = { [input.modelRef]: weaknesses }
  }

  return report
}

const CONFIDENCE_LABELS: Record<WeaknessConfidence, string> = {
  high: '高',
  medium: '中',
  low: '低',
}

/** 供研发本地查看的 Markdown 报告（中文产品向标题） */
export function formatWeaknessReportMarkdown(report: WeaknessReport): string {
  const lines: string[] = [
    '# 会话弱点报告',
    '',
    `- 生成时间：${report.generatedAt}`,
  ]
  if (report.sessionId) lines.push(`- 会话：${report.sessionId}`)
  if (report.modelRef) lines.push(`- 模型：${report.modelRef}`)
  lines.push(
    `- 统计：${report.totals.turnCount} 轮对话，${report.totals.assistantTurnCount} 轮助手回复，${report.totals.weaknessCount} 条弱点信号`,
    '',
  )

  if (!report.weaknesses.length) {
    lines.push('## 弱点概览', '', '未发现可分类的失败信号。', '')
    return lines.join('\n')
  }

  lines.push('## 弱点概览', '')
  lines.push('| 类型 | 次数 | 置信度 |')
  lines.push('| --- | ---: | --- |')
  for (const bucket of report.weaknesses) {
    lines.push(
      `| ${WEAKNESS_LABELS[bucket.code]} | ${bucket.count} | ${CONFIDENCE_LABELS[bucket.confidence]} |`,
    )
  }
  lines.push('', '## 证据摘要', '')

  for (const bucket of report.weaknesses) {
    lines.push(`### ${WEAKNESS_LABELS[bucket.code]}`, '')
    if (!bucket.evidence.length) {
      lines.push('（无详细证据）', '')
      continue
    }
    for (const [idx, item] of bucket.evidence.entries()) {
      const parts: string[] = []
      if (item.tool) parts.push(`工具 ${item.tool}`)
      if (item.label) parts.push(item.label)
      if (item.snippet) parts.push(item.snippet)
      lines.push(`${idx + 1}. ${parts.join(' — ')}`)
    }
    lines.push('')
  }

  return lines.join('\n')
}
