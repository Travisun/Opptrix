import type { StockSnapshot } from '@ni-k/shared'
import type { AshareEngine } from '@ni-k/a-stock-layer'
import { EvaluationEngine } from '../core/engine.js'
import { createScorecard } from '../scoring/scorecard.js'
import { REGISTRY } from '../core/registry.js'

export class PortfolioAnalyzer {
  constructor(private ee: EvaluationEngine, private de: AshareEngine) {}

  async analyze(holdings: [string, number][], scorecardName = '综合评估') {
    const card = createScorecard(scorecardName)
    const snaps: { snap: StockSnapshot; weight: number }[] = []
    for (const [code, weight] of holdings) {
      const snap = await this.ee.analyze(code)
      snaps.push({ snap, weight })
    }
    card.score(snaps.map(s => s.snap))

    const weightedScore = snaps.reduce((a, s) => a + s.snap.totalScore * s.weight, 0)
    const herfindahl = snaps.reduce((a, s) => a + s.weight ** 2, 0)
    const concentrationLabel = herfindahl < 0.1 ? '分散' : herfindahl < 0.3 ? '集中' : '高度集中'

    const industryExposure: Record<string, number> = {}
    for (const { snap, weight } of snaps) {
      const list = await this.de.stockList()
      const item = list.data?.find(x => x.code === snap.code)
      const ind = item?.industry || '未知'
      industryExposure[ind] = (industryExposure[ind] ?? 0) + weight
    }

    const factorNames = REGISTRY.list().slice(0, 8)
    const factorExposures = factorNames.map(fname => {
      const vals = snaps.map(s => s.snap.factors[fname]?.value).filter((v): v is number => v != null)
      const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null
      return {
        factor: fname,
        category: REGISTRY.get(fname)?.meta.category ?? '',
        active: avg,
        interpretation: avg != null && avg > 0 ? '正向暴露' : '负向暴露',
      }
    })

    return {
      num_stocks: holdings.length,
      weighted_score: Math.round(weightedScore * 10) / 10,
      herfindahl: Math.round(herfindahl * 1000) / 1000,
      concentration_label: concentrationLabel,
      industry_exposure: industryExposure,
      holdings: snaps.map(({ snap, weight }) => ({
        code: snap.code,
        name: snap.name,
        weight,
        score: snap.totalScore,
      })),
      factor_exposures: factorExposures,
    }
  }
}
