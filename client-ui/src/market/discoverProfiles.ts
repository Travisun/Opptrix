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

export const DISCOVER_PROFILE_ORDER: DiscoverStrategyProfile[] = [
  'cn_equity',
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
  cn_equity: '全 A 股票池 · 本地因子库初选与 AI 精选',
  cn_etf: 'ETF 折溢价、规模与同类对比 · 决策雷达',
  us_equity: '美股本地列表筛选（需开启美股数据包）',
  crypto_spot: 'Crypto 交易对筛选（需开启 Crypto 数据包）',
  jp_equity: '日股本地列表筛选（需开启日本数据包）',
  kr_equity: '韩股本地列表筛选（需开启韩国数据包）',
  hk_equity: '港股本地列表筛选（需开启港股数据包）',
}

export function defaultDiscoverProfile(): DiscoverStrategyProfile {
  return 'cn_equity'
}

export function isDiscoverProfileMiningReady(profile: DiscoverStrategyProfile): boolean {
  return profile === 'cn_equity'
    || profile === 'cn_etf'
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
  cautious: '动量偏弱，宜广谱初选后由 Agent 结合概况筛选。',
  neutral: '可按广谱或科技聚焦策略在本地列表中初选。',
  euphoria: '动量偏强，科技聚焦策略可配合 Agent 深挖，注意估值纪律。',
}

export function resolveRegimeStrategyIds(
  profile: DiscoverStrategyProfile,
  regime: MarketRegimeKind,
  equitySuggestedIds: string[],
): string[] {
  if (profile === 'cn_etf') return ETF_REGIME_STRATEGY_IDS[regime]
  if (profile === 'us_equity') return US_REGIME_STRATEGY_IDS[regime]
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
  if (profile === 'us_equity') {
    return regime.regime_note ?? US_REGIME_DETAIL[regime.regime] ?? regime.detail
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
