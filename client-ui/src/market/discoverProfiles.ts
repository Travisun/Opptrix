/** Mirrors @opptrix/shared/discover-profiles — kept local for client-ui bundling. */

import type { DiscoverProfileReadiness, MarketRegimeData } from '../types/schemas'

export type DiscoverStrategyProfile =
  | 'cn_equity'
  | 'cn_etf'
  | 'us_equity'
  | 'crypto_spot'

export type MarketRegimeKind = MarketRegimeData['regime']

export const DISCOVER_PROFILE_ORDER: DiscoverStrategyProfile[] = [
  'cn_equity',
  'cn_etf',
  'us_equity',
  'crypto_spot',
]

export const DISCOVER_PROFILE_LABELS: Record<DiscoverStrategyProfile, string> = {
  cn_equity: 'A 股股票',
  cn_etf: 'A 股 ETF',
  us_equity: '美股',
  crypto_spot: 'Crypto',
}

export const DISCOVER_PROFILE_DESCRIPTIONS: Record<DiscoverStrategyProfile, string> = {
  cn_equity: '全 A 股票池 · 本地因子库初选与 AI 精选',
  cn_etf: 'ETF 折溢价、规模与同类对比 · 决策雷达',
  us_equity: '美股本地列表筛选（需开启美股数据包）',
  crypto_spot: 'Crypto 交易对筛选（需开启 Crypto 数据包）',
}

export function defaultDiscoverProfile(): DiscoverStrategyProfile {
  return 'cn_equity'
}

export function isDiscoverProfileMiningReady(profile: DiscoverStrategyProfile): boolean {
  return profile === 'cn_equity' || profile === 'cn_etf'
}

export function inferBuiltinStrategyProfile(strategyId: string): DiscoverStrategyProfile {
  if (strategyId.startsWith('etf_')) return 'cn_etf'
  return 'cn_equity'
}

export const ETF_REGIME_STRATEGY_IDS: Record<MarketRegimeKind, string[]> = {
  panic: ['etf_low_premium', 'etf_broad_base'],
  cautious: ['etf_broad_base', 'etf_low_premium'],
  neutral: ['etf_broad_base', 'etf_scale_core'],
  euphoria: ['etf_scale_core', 'etf_low_premium'],
}

export const ETF_REGIME_DETAIL: Record<MarketRegimeKind, string> = {
  panic: '市场波动加大，可优先折溢价接近净值的宽基 ETF；留意流动性与跟踪误差。',
  cautious: '宜选规模适中、折溢价温和的宽基 ETF 做底仓观察。',
  neutral: '可按均衡思路筛选宽基与大盘流动性 ETF。',
  euphoria: '情绪偏热，优先大盘高流动性 ETF，折溢价不宜过高。',
}

export function resolveRegimeStrategyIds(
  profile: DiscoverStrategyProfile,
  regime: MarketRegimeKind,
  equitySuggestedIds: string[],
): string[] {
  if (profile === 'cn_etf') return ETF_REGIME_STRATEGY_IDS[regime]
  if (profile === 'cn_equity') {
    const filtered = equitySuggestedIds.filter(id => inferBuiltinStrategyProfile(id) === 'cn_equity')
    return filtered.length ? filtered : equitySuggestedIds
  }
  return []
}

export function regimeSuggestedIds(
  regime: MarketRegimeData,
  profile: DiscoverStrategyProfile,
): string[] {
  const fromApi = regime.suggested_by_profile?.[profile]
  if (fromApi?.length) return fromApi
  return resolveRegimeStrategyIds(profile, regime.regime, regime.suggested_strategy_ids)
}

export function regimeDetailForProfile(
  regime: MarketRegimeData,
  profile: DiscoverStrategyProfile,
): string {
  if (profile === 'cn_etf') {
    return regime.etf_regime_detail ?? ETF_REGIME_DETAIL[regime.regime] ?? regime.detail
  }
  return regime.detail
}

export function isProfileTabBlocked(
  profile: DiscoverStrategyProfile,
  readinessByProfile: Partial<Record<DiscoverStrategyProfile, DiscoverProfileReadiness>>,
): boolean {
  if (!isDiscoverProfileMiningReady(profile)) return false
  const row = readinessByProfile[profile]
  return row != null && !row.ready
}
