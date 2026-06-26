import type { AshareEngine } from '@ni-k/a-stock-layer'
import type {
  EvalDimension, InstitutionRatingItem, MethodSource, RatingLevel,
} from '@ni-k/shared'

const METHOD_WEIGHT: Record<MethodSource, number> = {
  documented: 1.0,
  partial: 0.85,
  research_style: 0.75,
  behavioral: 0.65,
}

const RATING_CN: Record<RatingLevel, string> = {
  strong_sell: '强烈卖出', sell: '卖出', hold: '持有',
  watch: '观望', buy: '买入', strong_buy: '强烈买入',
}

export function ratingFromConfidence(c: number): RatingLevel {
  if (c >= 8.5) return 'strong_buy'
  if (c >= 6.5) return 'buy'
  if (c >= 5.0) return 'watch'
  if (c >= 3.5) return 'hold'
  if (c >= 1.5) return 'sell'
  return 'strong_sell'
}

export interface EvalQuality {
  dataCompleteness: number
  dataTimeliness: number
  dimensionsPlanned: number
  dimensionsActual: number
  hasRealtime: boolean
  hasKline: boolean
  hasFinancials: boolean
  klineDays: number
  financialPeriods: number
}

export function buildQuality(
  planned: number,
  opts: {
    hasRealtime?: boolean
    hasKline?: boolean
    hasFinancials?: boolean
    klineDays?: number
    financialPeriods?: number
    actualDimensions?: number
  } = {},
): EvalQuality {
  let completeness = 0
  if (opts.hasRealtime) completeness += 20
  const kd = opts.klineDays ?? 0
  if (opts.hasKline && kd >= 250) completeness += 30
  else if (opts.hasKline && kd >= 60) completeness += 20
  else if (opts.hasKline) completeness += 10
  const fp = opts.financialPeriods ?? 0
  if (opts.hasFinancials && fp >= 4) completeness += 35
  else if (opts.hasFinancials && fp >= 2) completeness += 25
  else if (opts.hasFinancials) completeness += 15
  if (planned > 0) {
    completeness += 15 * Math.min(1, (opts.actualDimensions ?? 0) / planned)
  }
  const timeliness = opts.hasRealtime ? 1 : (opts.hasKline ? 0.7 : 0.3)
  return {
    dataCompleteness: Math.round(completeness) / 100,
    dataTimeliness: Math.round(timeliness * 100) / 100,
    dimensionsPlanned: planned,
    dimensionsActual: opts.actualDimensions ?? 0,
    hasRealtime: !!opts.hasRealtime,
    hasKline: !!opts.hasKline,
    hasFinancials: !!opts.hasFinancials,
    klineDays: kd,
    financialPeriods: fp,
  }
}

export function makeRating(
  code: string,
  institution: string,
  institutionShort: string,
  modelName: string,
  methodSource: MethodSource,
  group: string,
  dimensions: EvalDimension[],
  summary: string,
  quality?: EvalQuality,
  errors: string[] = [],
): InstitutionRatingItem {
  if (!dimensions.length) {
    return {
      institution, institutionShort, rating: 'hold', ratingCn: RATING_CN.hold,
      confidence: 5, rawConfidence: 5, methodSource, modelName, summary: '数据不足，无法评估',
      group, dimensions: [],
    }
  }
  const wsum = dimensions.reduce((s, d) => s + d.weight, 0)
  const raw = wsum > 0
    ? dimensions.reduce((s, d) => s + d.score * d.weight, 0) / wsum
    : 5
  const methodSmoothed = raw * (0.4 + 0.6 * METHOD_WEIGHT[methodSource])
  const qualityMult = quality ? 0.5 + 0.5 * quality.dataCompleteness : 1
  const calibrated = methodSmoothed * qualityMult
  const rating = ratingFromConfidence(calibrated)
  return {
    institution, institutionShort, rating,
    ratingCn: RATING_CN[rating],
    confidence: Math.round(calibrated * 100) / 100,
    rawConfidence: Math.round(raw * 100) / 100,
    methodSource, modelName, summary, group, dimensions,
  }
}

export function zScore(value: number, mean: number, std: number) {
  if (std === 0) return 5
  const z = (value - mean) / std
  return Math.max(1, Math.min(9, 5 + z * 1.5))
}

export function percentileScore(value: number, p10: number, p50: number, p90: number) {
  if (value <= p10) return 2
  if (value >= p90) return 8
  if (value <= p50) {
    const ratio = p50 !== p10 ? (value - p10) / (p50 - p10) : 0.5
    return 2 + ratio * 3
  }
  const ratio = p90 !== p50 ? (value - p50) / (p90 - p50) : 0.5
  return 5 + ratio * 3
}

export abstract class InstitutionEvaluator {
  abstract institution: string
  abstract institutionShort: string
  abstract modelName: string
  abstract methodSource: MethodSource
  abstract group: string
  abstract dimensionWeights: Record<string, number>
  plannedDimensions = 0

  constructor(protected de: AshareEngine) {}

  abstract computeDimensions(code: string): Promise<EvalDimension[]>

  async evaluate(code: string): Promise<InstitutionRatingItem> {
    const [finR, kR, rtR] = await Promise.all([
      this.de.financials(code), this.de.kline(code, 260), this.de.realtime(code),
    ])
    const dims = await this.computeDimensions(code)
    const quality = buildQuality(this.plannedDimensions, {
      hasRealtime: !!(rtR.success && rtR.data?.length),
      hasKline: !!(kR.success && kR.data?.length),
      hasFinancials: !!(finR.success && finR.data?.length),
      klineDays: kR.data?.length ?? 0,
      financialPeriods: finR.data?.length ?? 0,
      actualDimensions: dims.length,
    })
    const summary = dims.map(d => `${d.name}${d.score.toFixed(1)}`).join(' · ') || '数据有限'
    return makeRating(
      code, this.institution, this.institutionShort, this.modelName,
      this.methodSource, this.group, dims, summary, quality,
    )
  }

  protected safeFloat(val: unknown, def: number | null = null) {
    if (val == null) return def
    const v = Number(val)
    return Number.isFinite(v) ? v : def
  }
}
