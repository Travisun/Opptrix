/** Mirrors @opptrix/shared/discover-profiles — kept local for client-ui bundling. */

export type DiscoverStrategyProfile =
  | 'cn_equity'
  | 'cn_etf'
  | 'us_equity'
  | 'crypto_spot'

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
