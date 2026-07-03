import type { InstrumentRef } from './market-data.js'

export type InstrumentAnalyticsMode =
  | 'cn_factor_scorecard'
  | 'cn_etf_scorecard'
  | 'technical_bundle'
  | 'unsupported'

export type InstrumentAnalyticsCapability =
  | 'evaluation'
  | 'strategy_signal'
  | 'technical_indicators'
  | 'strategy_verify'

export interface InstrumentAnalyticsProfile {
  mode: InstrumentAnalyticsMode
  label: string
  supports: Record<InstrumentAnalyticsCapability, boolean>
  limitation?: string
}

const ALL_SUPPORTED: Record<InstrumentAnalyticsCapability, boolean> = {
  evaluation: true,
  strategy_signal: true,
  technical_indicators: true,
  strategy_verify: true,
}

const ALL_UNSUPPORTED: Record<InstrumentAnalyticsCapability, boolean> = {
  evaluation: false,
  strategy_signal: false,
  technical_indicators: false,
  strategy_verify: false,
}

const TECHNICAL_BUNDLE_SUPPORTS: Record<InstrumentAnalyticsCapability, boolean> = {
  evaluation: true,
  strategy_signal: true,
  technical_indicators: true,
  strategy_verify: true,
}

const TECHNICAL_LIMITATION = '不含 A 股估值/资金流因子'

function isCrossMarketEquity(ref: InstrumentRef): boolean {
  return (
    (ref.market === 'US' || ref.market === 'HK' || ref.market === 'JP' || ref.market === 'KR')
    && ref.assetClass === 'EQUITY'
  )
}

function isCryptoSpot(ref: InstrumentRef): boolean {
  return ref.market === 'CRYPTO' && ref.assetClass === 'CRYPTO_SPOT'
}

export function resolveInstrumentAnalyticsProfile(ref: InstrumentRef): InstrumentAnalyticsProfile {
  if (ref.market === 'CN' && ref.assetClass === 'EQUITY') {
    return {
      mode: 'cn_factor_scorecard',
      label: 'A 股因子评估',
      supports: ALL_SUPPORTED,
    }
  }

  if (ref.market === 'CN' && ref.assetClass === 'ETF') {
    return {
      mode: 'cn_etf_scorecard',
      label: 'ETF 决策雷达',
      supports: {
        evaluation: true,
        strategy_signal: true,
        technical_indicators: true,
        strategy_verify: false,
      },
    }
  }

  if (isCrossMarketEquity(ref) || isCryptoSpot(ref)) {
    return {
      mode: 'technical_bundle',
      label: '技术分析',
      supports: TECHNICAL_BUNDLE_SUPPORTS,
      limitation: TECHNICAL_LIMITATION,
    }
  }

  return {
    mode: 'unsupported',
    label: '暂不支持',
    supports: ALL_UNSUPPORTED,
  }
}

const CAPABILITY_REASON: Partial<Record<InstrumentAnalyticsCapability, string>> = {
  evaluation: '该市场暂不支持评估',
  strategy_signal: '该市场暂不支持策略信号',
  technical_indicators: '该市场暂不支持技术指标',
  strategy_verify: '该标的暂不支持策略验证',
}

export function gateInstrumentAnalytics(
  ref: InstrumentRef,
  cap: InstrumentAnalyticsCapability,
): { status: 'supported' | 'not_supported'; reason?: string } {
  const profile = resolveInstrumentAnalyticsProfile(ref)
  if (profile.supports[cap]) {
    return { status: 'supported' }
  }
  return {
    status: 'not_supported',
    reason: CAPABILITY_REASON[cap] ?? '该市场暂不支持此分析能力',
  }
}
