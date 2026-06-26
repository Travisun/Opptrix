export type SignalDirection = 'BUY' | 'SELL' | 'HOLD'

export interface Signal {
  name: string
  direction: SignalDirection
  strength: number
  source: string
  reason?: string
}

export interface AnalysisResult {
  code: string
  signals: Signal[]
  score: number
  verdict: SignalDirection
  confidence: number
  price: number
  reasons: string[]
  name?: string
}

export abstract class BaseStrategy {
  abstract readonly name: string
  abstract readonly displayName: string
  abstract readonly source: string
  abstract readonly weight: number
  abstract analyze(data: StrategyData): Signal[]
}

export interface StrategyData {
  code: string
  price?: number | null
  name?: string
  changePct?: number | null
  volumeRatio?: number | null
  turnoverRate?: number | null
  klineDaily?: { date: string; open: number; close: number; high: number; low: number; volume: number }[]
  kline60m?: StrategyData['klineDaily']
  indicators?: import('./indicators.js').IndicatorRow[]
  industry?: string
  sectorMoneyFlow?: Record<string, unknown>
  marketBreadth?: Record<string, unknown>
  shIndex?: number | null
  moneyFlow?: Record<string, unknown>[]
}

export function clampStrength(v: number) {
  return Math.max(0, Math.min(1, v))
}

export function mkSignal(
  name: string, direction: SignalDirection, strength: number, source: string, reason = '',
): Signal {
  return { name, direction, strength: clampStrength(strength), source, reason }
}
