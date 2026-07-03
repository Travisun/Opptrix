import type { InstrumentRef } from '@opptrix/shared'
import { isCnEtfCode } from '@opptrix/a-stock-layer'
import type { StrategyData } from './base.js'
import { lastRow, type IndicatorRow } from './indicators.js'
import { assessStrategyData } from './signal-engine.js'
import { STRATEGY_REGISTRY, fuseSignals } from './strategies.js'

function clamp0to100(v: number) {
  return Math.min(100, Math.max(0, v))
}

function scoreTo100(raw: number) {
  return clamp0to100((raw + 100) / 2)
}

function inferInstrument(ref: InstrumentRef | undefined, data: StrategyData) {
  if (ref) {
    return { market: ref.market, symbol: ref.symbol, assetClass: ref.assetClass }
  }
  const code = data.code.trim()
  if (/^\d{6}$/.test(code) || isCnEtfCode(code)) {
    return {
      market: 'CN' as const,
      symbol: code,
      assetClass: (isCnEtfCode(code) ? 'ETF' : 'EQUITY') as 'ETF' | 'EQUITY',
    }
  }
  return { market: 'US' as const, symbol: code.toUpperCase(), assetClass: 'EQUITY' as const }
}

function computeIndicatorHealth(data: StrategyData): number {
  const rows = data.indicators ?? []
  const last = lastRow(rows)
  if (!last) return 35

  let health = 45
  if (rows.length >= 60) health += 15
  else if (rows.length >= 30) health += 8

  const r6 = last.rsi_6
  if (r6 != null) {
    if (r6 >= 35 && r6 <= 65) health += 12
    else if (r6 >= 25 && r6 <= 75) health += 6
  }

  if (last.macd != null && last.macd_signal != null && last.macd_hist != null) {
    if ((last.macd > last.macd_signal && last.macd_hist > 0)
      || (last.macd < last.macd_signal && last.macd_hist < 0)) {
      health += 10
    }
  }

  if (last.ma5 != null && last.ma10 != null && last.ma20 != null) health += 8
  if (data.price != null && last.ma60 != null) health += 5

  return clamp0to100(health)
}

function buildDimensions(data: StrategyData) {
  return Object.entries(STRATEGY_REGISTRY).map(([, strat]) => {
    const sigs = strat.analyze(data)
    const fused = fuseSignals(sigs)
    const detail = sigs[0]?.reason
      ?? (fused.verdict === 'BUY' ? '偏多' : fused.verdict === 'SELL' ? '偏空' : '中性')
    return {
      name: strat.displayName,
      score: Math.round(scoreTo100(fused.score)),
      weight: strat.weight,
      detail,
    }
  })
}

export function buildTechnicalEvaluation(data: StrategyData, ref?: InstrumentRef) {
  const instrument = inferInstrument(ref, data)
  const allSignals = Object.values(STRATEGY_REGISTRY).flatMap(strat => {
    try { return strat.analyze(data) } catch { return [] }
  })
  const fused = fuseSignals(allSignals)
  const strategyPart = scoreTo100(fused.score)
  const indicatorHealth = computeIndicatorHealth(data)
  const total_score = Math.round(0.7 * strategyPart + 0.3 * indicatorHealth)

  const summary = assessStrategyData(data, instrument.symbol)
  const indicators_latest: IndicatorRow | null = lastRow(data.indicators ?? [])

  return {
    mode: 'technical_bundle' as const,
    instrument,
    code: instrument.symbol,
    name: data.name ?? instrument.symbol,
    price: data.price ?? 0,
    total_score,
    verdict: fused.verdict,
    confidence: fused.confidence,
    dimensions: buildDimensions(data),
    indicators_latest,
    strategy_summary: {
      summary: summary.summary,
      bullish_count: summary.bullish_count,
      bearish_count: summary.bearish_count,
      neutral_count: summary.neutral_count,
      score: summary.score,
      verdict: summary.verdict,
      confidence: summary.confidence,
      signals: summary.signals,
      reasons: summary.reasons,
    },
    limitation: '基于日K与技术指标，不含基本面因子',
    timestamp: new Date().toISOString(),
  }
}
