import type { AshareEngine } from '@ni-k/a-stock-layer'
import type { EvalDimension, InstitutionRatingItem, MethodSource } from '@ni-k/shared'
import { buildQuality, makeRating, ratingFromConfidence } from './evaluator.js'

export { ratingFromConfidence }

export interface EvaluatorConfig {
  institution: string
  institutionShort: string
  modelName: string
  group: string
  methodSource: MethodSource
  description: string
  dimensions: Record<string, number>
}

export class ConfigurableEvaluator {
  constructor(
    private de: AshareEngine,
    public config: EvaluatorConfig,
  ) {}

  async evaluate(code: string): Promise<InstitutionRatingItem> {
    const [finR, kR, rtR] = await Promise.all([
      this.de.financials(code), this.de.kline(code, 260), this.de.realtime(code),
    ])
    const fin = finR.data?.[0]
    const k = kR.data ?? []
    const dims: EvalDimension[] = []

    for (const [name, weight] of Object.entries(this.config.dimensions)) {
      let score = 5
      let detail = ''
      if (name.includes('成长') && fin) {
        const rev = fin.revenueYoy ?? 0
        score = rev > 25 ? 8 : rev > 10 ? 6.5 : rev > 0 ? 5 : 3
        detail = `营收同比 ${Number(rev).toFixed(1)}%`
      } else if (name.includes('盈利') && fin) {
        const roe = fin.roe ?? 0
        score = roe > 20 ? 8.5 : roe > 12 ? 7 : roe > 8 ? 5.5 : 4
        detail = `ROE ${Number(roe).toFixed(1)}%`
      } else if (name.includes('估值') && rtR.data?.[0]) {
        const pe = rtR.data[0].pe ?? 30
        score = pe < 15 ? 8 : pe < 25 ? 6 : pe < 40 ? 5 : 3.5
        detail = `PE ${Number(pe).toFixed(1)}`
      } else if (name.includes('质量') && fin) {
        const dr = fin.debtRatio ?? 50
        score = dr < 40 ? 7.5 : dr < 60 ? 6 : 4
        detail = `负债率 ${Number(dr).toFixed(1)}%`
      } else if ((name.includes('动量') || name.includes('价格')) && k.length > 60) {
        const ret = (k[k.length - 1].close - k[k.length - 61].close) / k[k.length - 61].close * 100
        score = ret > 15 ? 8 : ret > 0 ? 6 : 4
        detail = `3月涨幅 ${ret.toFixed(1)}%`
      } else if (name.includes('技术') && k.length > 20) {
        score = 5.5
        detail = '技术面中性'
      } else {
        detail = '数据有限'
      }
      dims.push({ name, score, weight, detail })
    }

    const planned = Object.keys(this.config.dimensions).length
    const quality = buildQuality(planned, {
      hasRealtime: !!(rtR.success && rtR.data?.length),
      hasKline: k.length > 0,
      hasFinancials: !!(finR.success && finR.data?.length),
      klineDays: k.length,
      financialPeriods: finR.data?.length ?? 0,
      actualDimensions: dims.length,
    })
    const summary = dims.map(d => `${d.name}${d.score.toFixed(1)}`).join(' · ') || '数据有限'
    return makeRating(
      code, this.config.institution, this.config.institutionShort,
      this.config.modelName, this.config.methodSource, this.config.group,
      dims, summary, quality,
    )
  }
}
