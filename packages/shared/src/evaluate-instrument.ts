import type { InstrumentRef } from './market-data.js'
import { gateInstrumentAnalytics } from './instrument-analytics.js'

export type InstrumentEvaluationStatus = 'supported' | 'not_supported'

export interface InstrumentEvaluationGate {
  status: InstrumentEvaluationStatus
  reason?: string
}

/** 评估 facade 入口 — 按 analytics profile 路由至因子评估 / ETF 雷达 / 技术分析 */
export function gateInstrumentEvaluation(ref: InstrumentRef): InstrumentEvaluationGate {
  return gateInstrumentAnalytics(ref, 'evaluation')
}
