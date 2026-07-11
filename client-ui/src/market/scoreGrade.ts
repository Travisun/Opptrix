/** Score band mapping — see docs/RIGHT-PANEL-RESEARCH-PLAN.md */

export interface ScoreGradeInfo {
  grade: string
  label: string
  description: string
  minScore: number
}

const GRADE_BANDS: ScoreGradeInfo[] = [
  { minScore: 80, grade: 'A', label: '优秀', description: '多维度综合表现领先，质地较好' },
  { minScore: 70, grade: 'B+', label: '良好', description: '整体不错，具备持续跟踪价值' },
  { minScore: 60, grade: 'B', label: '中等偏上', description: '部分维度有亮点，需结合行业与估值' },
  { minScore: 50, grade: 'C', label: '一般', description: '综合表现平平，宜谨慎参与' },
  { minScore: 0, grade: 'D', label: '偏弱', description: '多项指标偏弱，风险相对较高' },
]

export function scoreGrade(totalScore: number | null | undefined): string | null {
  if (totalScore == null || Number.isNaN(totalScore)) return null
  if (totalScore >= 80) return 'A'
  if (totalScore >= 70) return 'B+'
  if (totalScore >= 60) return 'B'
  if (totalScore >= 50) return 'C'
  return 'D'
}

export function getScoreGradeInfo(totalScore: number | null | undefined): (ScoreGradeInfo & { score: number }) | null {
  if (totalScore == null || Number.isNaN(totalScore)) return null
  const grade = scoreGrade(totalScore)
  if (!grade) return null
  const band = GRADE_BANDS.find(b => b.grade === grade)
  if (!band) return null
  return { ...band, score: totalScore }
}

/** Compact display: `72 分 · B+（良好）` */
export function formatScoreSummary(totalScore: number | null | undefined): string {
  const info = getScoreGradeInfo(totalScore)
  if (!info) return '待评估'
  return `${Math.round(info.score)} 分 · ${info.grade}（${info.label}）`
}

/** One-line explanation for the current score. */
export function formatScoreExplanation(totalScore: number | null | undefined): string | null {
  const info = getScoreGradeInfo(totalScore)
  if (!info) return null
  return `${info.description}。评分基于价值、质量、成长、动量等维度加权（0–100 分；A≥80，B+≥70，B≥60，C≥50，D<50）。`
}

/** 分析卡说明 — 面向投资者 */
export const SCORE_GRADE_LEGEND =
  '综合评分 0–100 分，综合价值、盈利质量、成长性、股价动能等维度；分数越高通常表示基本面与趋势相对更好。'

export const STRATEGY_SUMMARY_LEGEND =
  '多空倾向：综合多种交易规则后的整体看法，分为偏多、中性、偏空，仅供参考。'

export const VALUATION_LEGEND =
  '估值高低：当前市盈率、市净率在近年历史中的位置；分位越低通常表示相对更便宜。'

export const INSTITUTION_LEGEND =
  '研报观点：汇总近期券商研报的评级与倾向，不代表买卖建议。'

/** 将 API/配置中的评分模板名转为面向投资者的展示文案 */
export function formatScorecardDisplayName(name: string | null | undefined): string {
  if (!name) return '综合评分'
  if (name === 'G=B+M') return '基本面+动量'
  if (name.includes('决策雷达')) return name.replace(/决策雷达/g, '综合评分')
  return name
}
