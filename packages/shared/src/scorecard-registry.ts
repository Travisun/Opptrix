import type { DiscoverStrategyProfile } from './discover-profiles.js'

export type ScorecardProfile = Extract<DiscoverStrategyProfile, 'cn_equity' | 'cn_etf'>

export const ETF_SCORECARD_NAME = 'ETF决策雷达' as const

/** 与 @opptrix/stock-eval templates 对齐 — 供挖掘/筛选路由 */
export const EQUITY_SCORECARD_NAMES = [
  '综合评估',
  '价值评估',
  '成长评估',
  '质量评估',
  '技术评估',
  '动量评估',
  '低风险评估',
  '困境反转',
  'G=B+M',
  '巴菲特四透镜',
] as const

export type EquityScorecardName = (typeof EQUITY_SCORECARD_NAMES)[number]

export function scorecardProfileFromDiscover(
  profile: DiscoverStrategyProfile,
): ScorecardProfile | null {
  if (profile === 'cn_equity' || profile === 'cn_etf') return profile
  return null
}

export function listScorecardsForProfile(profile: ScorecardProfile): readonly string[] {
  return profile === 'cn_etf' ? [ETF_SCORECARD_NAME] : EQUITY_SCORECARD_NAMES
}

export function resolveScorecardName(profile: ScorecardProfile, requested?: string | null): string {
  const allowed = listScorecardsForProfile(profile)
  const name = requested?.trim()
  if (name && (allowed as readonly string[]).includes(name)) return name
  return profile === 'cn_etf' ? ETF_SCORECARD_NAME : '综合评估'
}

export function resolveDiscoverScorecard(
  profile: DiscoverStrategyProfile,
  requested?: string | null,
): string | null {
  const scorecardProfile = scorecardProfileFromDiscover(profile)
  if (!scorecardProfile) return null
  return resolveScorecardName(scorecardProfile, requested)
}

export function isEtfScorecardName(name: string): boolean {
  return name.trim() === ETF_SCORECARD_NAME
}
