import { TEMPLATES } from './templates.js'

const GBM_B_FACTORS = new Set([
  'roe', 'gross_margin', 'profit_cagr_3y', 'revenue_cagr_3y',
  'debt_ratio', 'pe_percentile', 'peg', 'roe_trend',
])

const GBM_M_FACTORS = new Set([
  'momentum_3m', 'momentum_6m', 'momentum_1m',
  'ma_position', 'rsi_score', 'volume_ratio', 'improvement_score',
])

export interface GbmBreakdown {
  b_score: number
  m_score: number
}

/** 从因子得分拆解 G=B+M 的 B / M 子分（各 0-10） */
export function computeGbmBreakdown(
  scores: Record<string, number>,
  scorecardName = 'G=B+M',
): GbmBreakdown | null {
  if (scorecardName !== 'G=B+M') return null
  const tpl = TEMPLATES[scorecardName]
  if (!tpl) return null

  let bTotal = 0
  let bWeight = 0
  let mTotal = 0
  let mWeight = 0

  for (const { name, weight } of tpl.factors) {
    const sc = scores[`${name}_score`]
    if (sc == null) continue
    if (GBM_B_FACTORS.has(name)) {
      bTotal += sc * weight
      bWeight += weight
    } else if (GBM_M_FACTORS.has(name)) {
      mTotal += sc * weight
      mWeight += weight
    }
  }

  if (bWeight === 0 && mWeight === 0) return null
  return {
    b_score: bWeight > 0 ? Math.round((bTotal / bWeight) * 10) / 10 : 0,
    m_score: mWeight > 0 ? Math.round((mTotal / mWeight) * 10) / 10 : 0,
  }
}
