import type { InstrumentRef } from './market-data.js'
import { hasApplicationCapability } from './instrument-capabilities.js'

export type InstrumentEvaluationStatus = 'supported' | 'not_supported'

export interface InstrumentEvaluationGate {
  status: InstrumentEvaluationStatus
  reason?: string
}

/** 评估 facade 入口 — CN 股票走 EvaluationEngine，其他市场返回 not_supported */
export function gateInstrumentEvaluation(ref: InstrumentRef): InstrumentEvaluationGate {
  if (hasApplicationCapability(ref, 'scorecard')) {
    return { status: 'supported' }
  }
  return {
    status: 'not_supported',
    reason: ref.market === 'CN' && ref.assetClass === 'ETF'
      ? 'ETF 请使用 ETF 决策雷达'
      : '该市场暂不支持因子评估',
  }
}
