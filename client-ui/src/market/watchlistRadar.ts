import type { WatchlistRadarItem } from '../types/schemas'
import type { WatchlistItem } from '../types/market'
import { formatCompactNumber } from './format'
import { scoreGrade } from './scoreGrade'

export { scoreGrade, formatScoreSummary, getScoreGradeInfo, formatScoreExplanation } from './scoreGrade'

export function formatValuationDisplay(input: {
  factors?: Record<string, number | null>
  pePercentile?: number | null
  pbPercentile?: number | null
  pe?: number | null
  pb?: number | null
}): string | null {
  const pePct = input.pePercentile ?? input.factors?.pe_percentile
  const pbPct = input.pbPercentile ?? input.factors?.pb_percentile
  if (pePct != null && !Number.isNaN(pePct)) {
    return `PE ${Math.round(pePct)}% 历史分位`
  }
  if (pbPct != null && !Number.isNaN(pbPct)) {
    return `PB ${Math.round(pbPct)}% 历史分位`
  }
  if (input.pe != null && input.pe > 0) {
    return `PE ${input.pe.toFixed(1)}x`
  }
  if (input.pb != null && input.pb > 0) {
    return `PB ${input.pb.toFixed(2)}x`
  }
  return null
}

function formatValuation(radar: WatchlistRadarItem): string | null {
  return formatValuationDisplay({
    pePercentile: radar.pe_percentile,
    pbPercentile: radar.pb_percentile,
    pe: radar.pe,
    pb: radar.pb,
  })
}

function formatMainFlow(mainNet: number | null | undefined): string | null {
  if (mainNet == null || Number.isNaN(mainNet)) return null
  const compact = formatCompactNumber(mainNet)
  if (compact === '—') return null
  const sign = mainNet > 0 ? '+' : ''
  return `主力 ${sign}${compact}`
}

/** Compact second-line radar summary for watchlist rows. */
export function formatWatchlistRadarLine(
  item: WatchlistItem,
  radar: WatchlistRadarItem | undefined,
  strategySummary?: string | null,
): string {
  const parts: string[] = []

  if (item.industry) parts.push(item.industry)

  const grade = scoreGrade(radar?.total_score)
  if (grade) parts.push(grade)
  else if (radar) parts.push('待评估')

  if (strategySummary) parts.push(strategySummary)

  if (radar) {
    const val = formatValuation(radar)
    if (val) parts.push(val)
    const flow = formatMainFlow(radar.main_net)
    if (flow) parts.push(flow)
  }

  return parts.join(' · ')
}
