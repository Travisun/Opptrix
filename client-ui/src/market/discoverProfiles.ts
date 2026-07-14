/** Mirrors @opptrix/shared/discover-profiles — kept local for client-ui bundling. */

import type { DiscoverProfileReadiness, MarketRegimeData } from '../types/schemas'

export type DiscoverStrategyProfile =
  | 'cn_equity'
  | 'cn_etf'
  | 'us_equity'
  | 'crypto_spot'
  | 'jp_equity'
  | 'kr_equity'
  | 'hk_equity'

export type MarketRegimeKind = MarketRegimeData['regime']

/** UI 可切换的挖掘 Profile（不含已停用的 A 股股票自动选股） */
export const DISCOVER_PROFILE_ORDER: DiscoverStrategyProfile[] = [
  'cn_etf',
  'us_equity',
  'crypto_spot',
  'jp_equity',
  'kr_equity',
  'hk_equity',
]

export const DISCOVER_PROFILE_LABELS: Record<DiscoverStrategyProfile, string> = {
  cn_equity: 'A 股股票',
  cn_etf: 'A 股 ETF',
  us_equity: '美股',
  crypto_spot: 'Crypto',
  jp_equity: '日本股市',
  kr_equity: '韩国股市',
  hk_equity: '港股',
}

export const DISCOVER_PROFILE_DESCRIPTIONS: Record<DiscoverStrategyProfile, string> = {
  cn_equity: 'A 股自动选股策略已移除（本地因子不可用）',
  cn_etf: 'ETF 折溢价、规模与同类对比 · 在线评估',
  us_equity: '美股名录在线筛选',
  crypto_spot: 'Crypto 交易对在线筛选',
  jp_equity: '日股名录在线筛选',
  kr_equity: '韩股名录在线筛选',
  hk_equity: '港股名录在线筛选',
}

export function defaultDiscoverProfile(): DiscoverStrategyProfile {
  return 'cn_etf'
}

export function isDiscoverProfileMiningReady(profile: DiscoverStrategyProfile): boolean {
  return profile === 'cn_etf'
    || profile === 'us_equity'
    || profile === 'crypto_spot'
    || profile === 'jp_equity'
    || profile === 'kr_equity'
    || profile === 'hk_equity'
}

export function inferBuiltinStrategyProfile(strategyId: string): DiscoverStrategyProfile {
  if (strategyId.startsWith('etf_')) return 'cn_etf'
  if (strategyId.startsWith('us_')) return 'us_equity'
  if (strategyId.startsWith('crypto_')) return 'crypto_spot'
  if (strategyId.startsWith('jp_')) return 'jp_equity'
  if (strategyId.startsWith('kr_')) return 'kr_equity'
  if (strategyId.startsWith('hk_')) return 'hk_equity'
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

export const US_REGIME_STRATEGY_IDS: Record<MarketRegimeKind, string[]> = {
  panic: ['us_broad_universe'],
  cautious: ['us_broad_universe'],
  neutral: ['us_broad_universe', 'us_tech_focus'],
  euphoria: ['us_tech_focus'],
}

export const US_REGIME_DETAIL: Record<MarketRegimeKind, string> = {
  panic: 'SPY 回撤偏大，可优先广谱样本策略，精选流动性好、基本面清晰的标的。',
  cautious: '动量偏弱，宜先用广谱策略初筛，再结合概况做进一步筛选。',
  neutral: '可按广谱或科技聚焦策略，在本地列表中逐步缩小范围。',
  euphoria: '动量偏强，科技聚焦策略可深入比对，注意估值纪律。',
}

export function resolveRegimeStrategyIds(
  profile: DiscoverStrategyProfile,
  regime: MarketRegimeKind,
  _equitySuggestedIds: string[],
): string[] {
  if (profile === 'cn_etf') return ETF_REGIME_STRATEGY_IDS[regime]
  if (profile === 'us_equity') return US_REGIME_STRATEGY_IDS[regime]
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
  if (profile === 'us_equity') {
    return regime.regime_note ?? US_REGIME_DETAIL[regime.regime] ?? regime.detail
  }
  return regime.detail
}

export function isProfileTabBlocked(
  profile: DiscoverStrategyProfile,
  readinessByProfile: Partial<Record<DiscoverStrategyProfile, DiscoverProfileReadiness>>,
): boolean {
  if (!isDiscoverProfileMiningReady(profile)) return true
  const row = readinessByProfile[profile]
  return row != null && !row.ready
}
