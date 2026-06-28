import { scoreGrade } from './scoreGrade'

export type DecisionMetricTone =
  | 'excellent'
  | 'good'
  | 'neutral'
  | 'caution'
  | 'risk'
  | 'bullish'
  | 'bearish'
  | 'muted'

export function scoreMetricTone(totalScore: number | null | undefined): DecisionMetricTone {
  if (totalScore == null || Number.isNaN(totalScore)) return 'muted'
  if (totalScore >= 80) return 'excellent'
  if (totalScore >= 70) return 'good'
  if (totalScore >= 60) return 'neutral'
  if (totalScore >= 50) return 'caution'
  return 'risk'
}

export function strategyMetricTone(summary: string | null | undefined): DecisionMetricTone {
  if (!summary?.trim()) return 'muted'
  if (summary.startsWith('偏多')) return 'bullish'
  if (summary.startsWith('偏空')) return 'bearish'
  return 'neutral'
}

/** Lower historical percentile = cheaper = greener. */
export function valuationMetricTone(label: string | null | undefined): DecisionMetricTone {
  if (!label?.trim()) return 'muted'
  const match = label.match(/(\d+(?:\.\d+)?)\s*%\s*历史分位/)
  if (match) {
    const pct = Number(match[1])
    if (pct <= 35) return 'excellent'
    if (pct <= 55) return 'good'
    if (pct <= 75) return 'caution'
    return 'risk'
  }
  return 'neutral'
}

export function flowMetricTone(label: string | null | undefined): DecisionMetricTone {
  if (!label?.trim()) return 'muted'
  if (label.includes('+')) return 'bullish'
  if (label.includes('-')) return 'bearish'
  return 'neutral'
}

export function holdingMetricTone(label: string | null | undefined): DecisionMetricTone {
  if (!label?.trim()) return 'muted'
  const match = label.match(/浮盈\s*([+-]?\d+(?:\.\d+)?)%/)
  if (!match) return 'neutral'
  const pct = Number(match[1])
  if (pct > 0) return 'bullish'
  if (pct < 0) return 'bearish'
  return 'neutral'
}

export function signalDirectionTone(direction: string): DecisionMetricTone {
  if (direction === '看多') return 'bullish'
  if (direction === '看空') return 'bearish'
  return 'neutral'
}

export function institutionMetricTone(label: string | null | undefined): DecisionMetricTone {
  if (!label?.trim()) return 'muted'
  if (/买入|增持|推荐|强推/.test(label)) return 'bullish'
  if (/卖出|减持|回避|下调/.test(label)) return 'bearish'
  return 'neutral'
}

export function scoreGradeToneByGrade(grade: string | null | undefined): DecisionMetricTone {
  if (!grade) return 'muted'
  if (grade === 'A') return 'excellent'
  if (grade === 'B+') return 'good'
  if (grade === 'B') return 'neutral'
  if (grade === 'C') return 'caution'
  if (grade === 'D') return 'risk'
  return scoreMetricTone(null)
}

/** Re-export for components that only have grade string. */
export { scoreGrade }
