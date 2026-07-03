import type { AshareEngine } from '@opptrix/a-stock-layer'
import type { InstrumentRef } from '@opptrix/shared'
import type { StrategyData } from './base.js'
import type { Signal } from './base.js'
import { gatherFromKline } from './data.js'
import { gatherStrategyData, gatherStrategyDataFromCode } from './gather-strategy-data.js'
import { STRATEGY_LABELS, STRATEGY_REGISTRY, dominantDirection, fuseSignals } from './strategies.js'

export class SignalEngine {
  constructor(private engine: AshareEngine) {}

  async analyze(code: string, ref?: InstrumentRef) {
    const data = ref
      ? await gatherStrategyData(this.engine, ref)
      : await gatherStrategyDataFromCode(this.engine, code)
    const allSignals: Signal[] = []
    for (const strategy of Object.values(STRATEGY_REGISTRY)) {
      try { allSignals.push(...strategy.analyze(data)) } catch { /* skip */ }
    }
    const fused = fuseSignals(allSignals)
    return { code, name: data.name ?? '', price: data.price ?? 0, signals: allSignals, ...fused }
  }
}

export async function quickAssess(de: AshareEngine, code: string, ref?: InstrumentRef) {
  const data = ref
    ? await gatherStrategyData(de, ref)
    : await gatherStrategyDataFromCode(de, code)
  const allSignals: Signal[] = []
  const byStrategy = Object.entries(STRATEGY_REGISTRY).map(([key, strat]) => {
    const sigs = strat.analyze(data)
    allSignals.push(...sigs)
    const dir = dominantDirection(sigs)
    return {
      name: STRATEGY_LABELS[key] ?? strat.displayName,
      direction: dir,
      confidence: sigs.length
        ? Math.min(0.9, sigs.reduce((a, s) => a + s.strength, 0) / sigs.length)
        : 0.5,
      detail: sigs[0]?.reason,
    }
  })

  const fused = fuseSignals(allSignals)
  const bullish = byStrategy.filter(s => s.direction === '看多').length
  const bearish = byStrategy.filter(s => s.direction === '看空').length
  const summary = fused.verdict === 'BUY' ? '偏多' : fused.verdict === 'SELL' ? '偏空' : '中性'

  return {
    code,
    name: data.name ?? '',
    summary,
    bullish_count: bullish,
    bearish_count: bearish,
    neutral_count: byStrategy.length - bullish - bearish,
    score: fused.score,
    verdict: fused.verdict,
    confidence: fused.confidence,
    signals: byStrategy,
    reasons: fused.reasons,
  }
}

interface StrategyPerf {
  name: string
  overall_win_rate: number
  avg_return: number
  sharpe: number | null
  signal_count: number
  buy_signals: number
  sell_signals: number
  buy_win_rate: number
  sell_win_rate: number
  precision: number
  recall: number
  signal_freq: number
}

function evalAtSlice(strategyKey: string, data: StrategyData) {
  const sigs = STRATEGY_REGISTRY[strategyKey].analyze(data)
  return fuseSignals(sigs).verdict
}

export async function verifyStrategy(de: AshareEngine, code: string, checkpoints = 30, forwardDays = 5) {
  const rt = await de.realtime(code)
  const name = rt.data?.[0]?.name ?? code
  const kl = await de.kline(code, 400)
  if (!kl.success || !kl.data || kl.data.length < 120) {
    return {
      code, name, checkpoints: 0, forward_days: forwardDays,
      performances: Object.values(STRATEGY_LABELS).map(label => ({
        name: label, overall_win_rate: 0, avg_return: 0, sharpe: null, signal_count: 0,
        buy_signals: 0, sell_signals: 0, buy_win_rate: 0, sell_win_rate: 0,
        precision: 0, recall: 0, signal_freq: 0,
      })),
      avg_win_rate: 0,
      best_strategy: null,
    }
  }

  const klines = kl.data
  const end = klines.length - forwardDays - 1
  const start = 120
  const indices: number[] = []
  const step = Math.max(1, Math.floor((end - start) / Math.max(1, checkpoints - 1)))
  for (let i = start; i <= end && indices.length < checkpoints; i += step) indices.push(i)

  const perfMap = new Map<string, {
    buy: number; sell: number; buyOk: number; sellOk: number
    buyRets: number[]; sellRets: number[]; checks: number
  }>()
  for (const key of Object.keys(STRATEGY_REGISTRY)) {
    perfMap.set(key, { buy: 0, sell: 0, buyOk: 0, sellOk: 0, buyRets: [], sellRets: [], checks: 0 })
  }

  let totalUpMoves = 0

  for (const idx of indices) {
    const sliceData = gatherFromKline(code, klines, idx)
    const cur = klines[idx].close
    const future = klines[idx + forwardDays]?.close ?? cur
    const fwdRet = ((future - cur) / cur) * 100
    if (fwdRet > 0.5) totalUpMoves++

    for (const key of Object.keys(STRATEGY_REGISTRY)) {
      const perf = perfMap.get(key)!
      perf.checks++
      const direction = evalAtSlice(key, sliceData)
      if (direction === 'BUY') {
        perf.buy++
        perf.buyRets.push(fwdRet)
        if (fwdRet > 0.5) perf.buyOk++
      } else if (direction === 'SELL') {
        perf.sell++
        perf.sellRets.push(-fwdRet)
        if (fwdRet < -0.5) perf.sellOk++
      }
    }
  }

  const performances: StrategyPerf[] = []
  for (const [key, label] of Object.entries(STRATEGY_LABELS)) {
    const p = perfMap.get(key)!
    const correct = p.buyOk + p.sellOk
    const wrong = (p.buy - p.buyOk) + (p.sell - p.sellOk)
    const winRate = correct + wrong > 0 ? correct / (correct + wrong) : 0
    const allRets = [...p.buyRets, ...p.sellRets]
    const avgRet = allRets.length ? allRets.reduce((a, b) => a + b, 0) / allRets.length / 100 : 0
    const mean = allRets.length ? allRets.reduce((a, b) => a + b, 0) / allRets.length : 0
    const std = allRets.length > 2
      ? Math.sqrt(allRets.reduce((a, r) => a + (r - mean) ** 2, 0) / (allRets.length - 1))
      : 0
    const buyWinRate = p.buy > 0 ? p.buyOk / p.buy : 0
    const sellWinRate = p.sell > 0 ? p.sellOk / p.sell : 0
    const precision = p.buy > 0 ? p.buyOk / p.buy : 0
    const recall = totalUpMoves > 0 ? p.buyOk / totalUpMoves : 0
    const signalFreq = p.checks > 0 ? (p.buy + p.sell) / p.checks : 0
    performances.push({
      name: label,
      overall_win_rate: winRate,
      avg_return: avgRet,
      sharpe: std > 0 ? (mean / std) * Math.sqrt(10) : null,
      signal_count: p.checks,
      buy_signals: p.buy,
      sell_signals: p.sell,
      buy_win_rate: buyWinRate,
      sell_win_rate: sellWinRate,
      precision,
      recall,
      signal_freq: signalFreq,
    })
  }

  const active = performances.filter(p => p.buy_signals + p.sell_signals > 0)
  const best = active.length
    ? active.reduce((a, b) => (b.overall_win_rate > a.overall_win_rate ? b : a))
    : null

  return {
    code, name, checkpoints: indices.length, forward_days: forwardDays,
    performances,
    avg_win_rate: performances.reduce((a, p) => a + p.overall_win_rate, 0) / performances.length,
    best_strategy: best ? { name: best.name, win_rate: best.overall_win_rate } : null,
    date_range: [klines[0].date, klines[klines.length - 1].date],
  }
}

export { STRATEGY_REGISTRY, STRATEGY_LABELS, listStrategies } from './strategies.js'
