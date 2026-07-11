import type { InstitutionRatingData, LatestEvalData, StrategySignalData, WatchlistRadarItem } from '../types/schemas'
import type { ChipDistributionPoint, StockMoneyFlowItem, WatchlistItem } from '../types/market'
import type { HoldingSnapshot } from './useFollowPortfolio'
import { positiveFactorBullet, riskFactorBullet } from './factorLabels'
import { formatCompactNumber, formatPct, formatPrice } from './format'
import { formatScoreExplanation, formatScoreSummary, formatScorecardDisplayName, scoreGrade } from './scoreGrade'
import { formatValuationDisplay } from './watchlistRadar'

export function formatStrategyDisplay(strategy: StrategySignalData | null): string | null {
  if (!strategy) return null

  let summary: string | null = strategy.summary?.trim() || null
  if (!summary && strategy.verdict) {
    if (strategy.verdict === 'BUY') summary = '偏多'
    else if (strategy.verdict === 'SELL') summary = '偏空'
    else summary = '中性'
  }
  if (!summary && strategy.signals?.length) {
    const bullish = strategy.signals.filter(s => s.direction === '看多').length
    const bearish = strategy.signals.filter(s => s.direction === '看空').length
    if (bullish > bearish) summary = '偏多'
    else if (bearish > bullish) summary = '偏空'
    else summary = '中性'
  }
  if (!summary) {
    if (strategy.bullish_count > strategy.bearish_count) summary = '偏多'
    else if (strategy.bearish_count > strategy.bullish_count) summary = '偏空'
    else if (strategy.bullish_count + strategy.bearish_count + strategy.neutral_count > 0) summary = '中性'
  }

  if (!summary) return null

  const parts = [summary]
  if (strategy.score != null && !Number.isNaN(strategy.score)) {
    parts.push(`得分 ${Math.round(strategy.score)}`)
  } else if (strategy.confidence != null && !Number.isNaN(strategy.confidence)) {
    parts.push(`置信 ${Math.round(strategy.confidence * 100)}%`)
  }
  if (strategy.bullish_count + strategy.bearish_count > 0) {
    parts.push(`多${strategy.bullish_count}/空${strategy.bearish_count}`)
  }
  return parts.join(' · ')
}

export interface DecisionCardViewModel {
  totalScore: number | null
  grade: string | null
  scoreSummary: string
  scoreExplanation: string | null
  scorecardLabel: string | null
  gbmLabel: string | null
  strategySummary: string | null
  institutionLabel: string | null
  valuationLabel: string | null
  thesis: string[]
  risks: string[]
  priceLabel: string
  holdingLabel: string | null
  cyqLabel: string | null
  flowLabel: string | null
}

function pickThesis(factors: Record<string, number | null>): string[] {
  const bullets: string[] = []
  const seen = new Set<string>()

  const add = (text: string | null) => {
    if (!text || seen.has(text) || bullets.length >= 3) return
    seen.add(text)
    bullets.push(text)
  }

  for (const [key, val] of Object.entries(factors)) {
    if (val == null) continue
    add(positiveFactorBullet(key, val))
    if (bullets.length >= 3) break
  }

  return bullets.slice(0, 3)
}

function pickRisks(
  factors: Record<string, number | null>,
  strategy: StrategySignalData | null,
): string[] {
  const bullets: string[] = []
  const seen = new Set<string>()

  const add = (text: string | null) => {
    if (!text || seen.has(text) || bullets.length >= 3) return
    seen.add(text)
    bullets.push(text)
  }

  for (const [key, val] of Object.entries(factors)) {
    if (val == null) continue
    add(riskFactorBullet(key, val))
    if (bullets.length >= 3) break
  }

  if (strategy?.summary === '偏空' || strategy?.verdict === 'SELL') add('综合策略信号偏空')
  else if (
    strategy
    && strategy.bearish_count > strategy.bullish_count
    && strategy.bearish_count > 0
    && !strategy.summary
    && !strategy.verdict
  ) add('综合策略信号偏空')

  return bullets.slice(0, 3)
}

export function buildDecisionCardViewModel(input: {
  stock: WatchlistItem
  price: number | null
  evalData: LatestEvalData | null
  strategy: StrategySignalData | null
  institution: InstitutionRatingData | null
  cyq: ChipDistributionPoint | null
  moneyFlow: StockMoneyFlowItem | null
  holding: HoldingSnapshot | null | undefined
  quotePe?: number | null
  quotePb?: number | null
  radar?: WatchlistRadarItem | null
}): DecisionCardViewModel {
  const factors = input.evalData?.factors ?? {}
  const totalScore = input.evalData?.total_score ?? null
  const scorecard = input.evalData?.scorecard ?? null
  const gbm = input.evalData?.gbm ?? null

  let gbmLabel: string | null = null
  if (gbm) {
    gbmLabel = `B ${gbm.b_score.toFixed(1)} · M ${gbm.m_score.toFixed(1)}`
  }

  const valuationLabel = formatValuationDisplay({
    factors,
    pePercentile: input.radar?.pe_percentile,
    pbPercentile: input.radar?.pb_percentile,
    pe: input.quotePe ?? input.radar?.pe,
    pb: input.quotePb ?? input.radar?.pb,
  })

  let institutionLabel: string | null = null
  if (input.institution) {
    const n = input.institution.ratings?.length ?? 0
    institutionLabel = n > 0
      ? `${input.institution.consensus_rating_cn} · ${n} 家`
      : input.institution.consensus_rating_cn
  }

  let holdingLabel: string | null = null
  if (input.holding && input.holding.shares > 0) {
    const cost = input.holding.costBasis
    const pnl = input.holding.unrealizedPnlPct ?? input.holding.totalPnlPct
    holdingLabel = `成本 ${formatPrice(cost)} · 浮盈 ${formatPct(pnl, 1)}`
  }

  let cyqLabel: string | null = null
  if (input.cyq) {
    cyqLabel = `获利 ${(input.cyq.benefitPart * 100).toFixed(0)}% · 均成 ${formatPrice(input.cyq.avgCost)}`
  }

  let flowLabel: string | null = null
  if (input.moneyFlow?.mainNet != null) {
    const v = input.moneyFlow.mainNet
    const sign = v > 0 ? '+' : ''
    flowLabel = `主力 ${sign}${formatCompactNumber(v)}`
  }

  return {
    totalScore,
    grade: scoreGrade(totalScore),
    scoreSummary: formatScoreSummary(totalScore),
    scoreExplanation: formatScoreExplanation(totalScore),
    scorecardLabel: scorecard ? formatScorecardDisplayName(scorecard) : null,
    gbmLabel,
    strategySummary: formatStrategyDisplay(input.strategy),
    institutionLabel,
    valuationLabel,
    thesis: pickThesis(factors),
    risks: pickRisks(factors, input.strategy),
    priceLabel: formatPrice(input.price),
    holdingLabel,
    cyqLabel,
    flowLabel,
  }
}

export type DiscussTopic = 'buy' | 'sell'

export function buildStockResearchContext(input: {
  stock: WatchlistItem
  topic: DiscussTopic
  vm: DecisionCardViewModel
  evalData: LatestEvalData | null
  strategy: StrategySignalData | null
  institution: InstitutionRatingData | null
}): string {
  const { stock, topic, vm } = input
  const lines: string[] = [
    `# ${stock.name}（${stock.code}）分析卡 · ${topic === 'buy' ? '买入研讨' : '卖出研讨'}`,
    '',
    '## 摘要',
    `- 现价：${vm.priceLabel}`,
    vm.grade ? `- 综合评分：${vm.scoreSummary}` : '- 综合评分：待评估',
    vm.scorecardLabel ? `- 评分方式：${vm.scorecardLabel}` : null,
    vm.gbmLabel ? `- 基本面与动量：${vm.gbmLabel}` : null,
    vm.scoreExplanation ? `- 评分说明：${vm.scoreExplanation}` : null,
    vm.strategySummary ? `- 策略倾向：${vm.strategySummary}` : null,
    vm.institutionLabel ? `- 机构共识：${vm.institutionLabel}` : null,
    vm.valuationLabel ? `- 估值：${vm.valuationLabel}` : null,
    vm.holdingLabel ? `- 持仓：${vm.holdingLabel}` : null,
    vm.cyqLabel ? `- 筹码：${vm.cyqLabel}` : null,
    vm.flowLabel ? `- 资金：${vm.flowLabel}` : null,
    stock.note ? `- 关注备注：${stock.note}` : null,
    '',
    '## 看好理由',
    ...(vm.thesis.length ? vm.thesis.map(t => `- ${t}`) : ['- （暂无显著正向亮点，需结合定性判断）']),
    '',
    '## 风险提示',
    ...(vm.risks.length ? vm.risks.map(t => `- ${t}`) : ['- （暂无显著风险项）']),
  ].filter((line): line is string => line != null)

  if (input.strategy?.signals?.length) {
    lines.push('', '## 策略信号明细')
    for (const sig of input.strategy.signals.slice(0, 5)) {
      lines.push(`- ${sig.name}：${sig.direction}（置信 ${Math.round(sig.confidence * 100)}%）`)
    }
  }

  if (topic === 'buy') {
    lines.push('', '## 研讨方向', '请结合以上数据，分析买入时机、合理仓位、止损/加仓条件与主要风险。')
  } else {
    lines.push('', '## 研讨方向', '请结合以上数据，分析是否应减仓或卖出、关键价位与剩余持仓逻辑。')
  }

  return lines.join('\n')
}
