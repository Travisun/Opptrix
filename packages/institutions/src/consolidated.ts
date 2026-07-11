import type { AshareEngine } from '@opptrix/a-stock-layer'
import type { InstitutionRatingItem, RatingLevel, InstrumentRef } from '@opptrix/shared'
import { normalizeInstrumentRef, buildInstrumentNamespace } from '@opptrix/shared'
import { ConfigurableEvaluator, type EvaluatorConfig, ratingFromConfidence, queryInstrumentRows } from './base.js'
import { EVALUATOR_CONFIGS } from './registry.js'

const RATING_CN: Record<RatingLevel, string> = {
  strong_sell: '强烈卖出', sell: '卖出', hold: '持有',
  watch: '观望', buy: '买入', strong_buy: '强烈买入',
}

export function formatInstitutionReport(data: {
  code: string; name: string; consensus_rating_cn: string
  avg_confidence: number; agreement_rate: number
  rating_distribution: Record<string, number>
  ratings: { institutionShort: string; ratingCn: string; confidence: number; summary: string }[]
}) {
  const lines = [
    `机构综合评级报告 — ${data.name}(${data.code})`,
    `共识: ${data.consensus_rating_cn} | 平均信心 ${data.avg_confidence}/10 | 一致率 ${(data.agreement_rate * 100).toFixed(0)}%`,
    '',
    '--- 评级分布 ---',
    ...Object.entries(data.rating_distribution).map(([k, v]) => `  ${k}: ${v}`),
    '',
    '--- 机构明细 ---',
  ]
  for (const r of data.ratings) {
    lines.push(`  ${r.institutionShort} ${r.ratingCn} ${r.confidence}/10 — ${r.summary}`)
  }
  return lines.join('\n')
}

export class ConsolidatedEngine {
  private evaluators: ConfigurableEvaluator[]

  constructor(private de: AshareEngine) {
    this.evaluators = EVALUATOR_CONFIGS.map(c => new ConfigurableEvaluator(de, c))
  }

  async evaluate(input: string | InstrumentRef, groups?: string[]) {
    const ref = typeof input === 'string'
      ? normalizeInstrumentRef({ market: 'CN', assetClass: 'EQUITY', symbol: input })
      : normalizeInstrumentRef(input)
    const code = ref.symbol
    const ns = buildInstrumentNamespace(ref)
    const t0 = Date.now()
    let name = ns
    const rt = await this.de.queryInstrumentData(ref, 'realtime')
    const rtRow = queryInstrumentRows<import('@opptrix/shared').StockRealtime>(rt)[0]
    if (rtRow?.name) name = rtRow.name

    const selected = groups?.length
      ? this.evaluators.filter(e => groups.includes(e.config.group))
      : this.evaluators

    const ratings: InstitutionRatingItem[] = []
    for (const ev of selected) {
      ratings.push(await ev.evaluate(ref))
    }

    const confidences = ratings.map(r => r.confidence)
    const avg = confidences.reduce((a, b) => a + b, 0) / confidences.length
    const std = Math.sqrt(confidences.reduce((a, c) => a + (c - avg) ** 2, 0) / confidences.length)
    const consensus = ratingFromConfidence(avg)

    const distribution: Record<string, number> = {}
    for (const r of ratings) distribution[r.rating] = (distribution[r.rating] ?? 0) + 1

    const bullish = ratings.filter(r => r.rating === 'buy' || r.rating === 'strong_buy').length
    const bearish = ratings.filter(r => r.rating === 'sell' || r.rating === 'strong_sell').length
    const neutral = ratings.length - bullish - bearish

    const groupStats: Record<string, { avg: number; count: number; buy: number; sell: number }> = {}
    for (const r of ratings) {
      const g = r.group
      if (!groupStats[g]) groupStats[g] = { avg: 0, count: 0, buy: 0, sell: 0 }
      groupStats[g].avg += r.confidence
      groupStats[g].count += 1
      if (r.rating === 'buy' || r.rating === 'strong_buy') groupStats[g].buy += 1
      if (r.rating === 'sell' || r.rating === 'strong_sell') groupStats[g].sell += 1
    }
    for (const g of Object.keys(groupStats)) {
      groupStats[g].avg = Math.round((groupStats[g].avg / groupStats[g].count) * 10) / 10
    }

    const topRating = ratings.reduce((a, b) =>
      (distribution[a.rating] ?? 0) >= (distribution[b.rating] ?? 0) ? a : b)
    const agreement = (distribution[topRating.rating] ?? 0) / ratings.length

    return {
      code: ns, name,
      avg_confidence: Math.round(avg * 10) / 10,
      avg_raw_confidence: Math.round(avg * 10) / 10,
      consensus_rating: consensus,
      consensus_rating_cn: RATING_CN[consensus],
      confidence_std: Math.round(std * 10) / 10,
      agreement_rate: Math.round(agreement * 1000) / 1000,
      rating_distribution: distribution,
      bullish_count: bullish,
      bearish_count: bearish,
      neutral_count: neutral,
      group_stats: groupStats,
      ratings,
      avg_data_quality: 0.85,
      elapsed: (Date.now() - t0) / 1000,
    }
  }
}

export { EVALUATOR_CONFIGS } from './registry.js'
