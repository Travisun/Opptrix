import type { ResearchResult } from '@opptrix/shared'
import {
  fail,
  gateInstrumentAnalytics,
  instrumentRefFromParams,
  resolveInstrumentAnalyticsProfile,
  type InstrumentRef,
} from '@opptrix/shared'

export type InstrumentAnalyticsRouteHandlers = {
  cnFactorEvaluation: (ref: InstrumentRef) => Promise<ResearchResult>
  cnEtfEvaluation: (ref: InstrumentRef) => Promise<ResearchResult>
  technicalEvaluation: (ref: InstrumentRef) => Promise<ResearchResult>
  strategyAssess: (ref: InstrumentRef) => Promise<ResearchResult>
  buildIndicators: (ref: InstrumentRef) => Promise<ResearchResult>
  strategyVerify: (ref: InstrumentRef, checkpoints: number, forwardDays: number) => Promise<ResearchResult>
}

export async function routeInstrumentEvaluation(
  params: Record<string, unknown>,
  handlers: InstrumentAnalyticsRouteHandlers,
): Promise<ResearchResult> {
  const ref = instrumentRefFromParams(params)
  if (!ref) return fail('instrument 或 market+symbol 必填')

  const gate = gateInstrumentAnalytics(ref, 'evaluation')
  if (gate.status === 'not_supported') {
    return fail(gate.reason ?? '该市场暂不支持评估')
  }

  const profile = resolveInstrumentAnalyticsProfile(ref)
  if (profile.mode === 'cn_factor_scorecard') {
    return handlers.cnFactorEvaluation(ref)
  }
  if (profile.mode === 'cn_etf_scorecard') {
    return handlers.cnEtfEvaluation(ref)
  }
  if (profile.mode === 'technical_bundle') {
    return handlers.technicalEvaluation(ref)
  }
  return fail('该市场暂不支持评估')
}

export async function routeInstrumentStrategySignal(
  params: Record<string, unknown>,
  handlers: InstrumentAnalyticsRouteHandlers,
): Promise<ResearchResult> {
  const ref = instrumentRefFromParams(params)
  if (!ref) return fail('instrument 或 market+symbol 必填')

  const gate = gateInstrumentAnalytics(ref, 'strategy_signal')
  if (gate.status === 'not_supported') {
    return fail(gate.reason ?? '该市场暂不支持策略信号')
  }

  return handlers.strategyAssess(ref)
}

export async function routeInstrumentIndicators(
  params: Record<string, unknown>,
  handlers: InstrumentAnalyticsRouteHandlers,
): Promise<ResearchResult> {
  const ref = instrumentRefFromParams(params)
  if (!ref) return fail('instrument 或 market+symbol 必填')

  const gate = gateInstrumentAnalytics(ref, 'technical_indicators')
  if (gate.status === 'not_supported') {
    return fail(gate.reason ?? '该市场暂不支持技术指标')
  }

  return handlers.buildIndicators(ref)
}

export async function routeInstrumentStrategyVerify(
  params: Record<string, unknown>,
  handlers: InstrumentAnalyticsRouteHandlers,
): Promise<ResearchResult> {
  const ref = instrumentRefFromParams(params)
  if (!ref) return fail('instrument 或 market+symbol 必填')

  const gate = gateInstrumentAnalytics(ref, 'strategy_verify')
  if (gate.status === 'not_supported') {
    return fail(gate.reason ?? '该标的暂不支持策略验证')
  }

  const checkpoints = params.checkpoints != null ? Number(params.checkpoints) : 30
  const forwardDays = params.forwardDays != null
    ? Number(params.forwardDays)
    : params.forward_days != null
      ? Number(params.forward_days)
      : 5

  return handlers.strategyVerify(ref, checkpoints, forwardDays)
}
