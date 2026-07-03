import type { MarketDataPackId } from './market-data-packs.js'

/** 挖掘/评分策略适用的资产 Profile（策略层主轴，非裸 market） */
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

/** 策略执行所需的数据包；null 表示不依赖 pack 开关 */
export const DISCOVER_PROFILE_REQUIRES_PACK: Record<DiscoverStrategyProfile, MarketDataPackId | null> = {
  cn_equity: 'cn',
  cn_etf: 'cn',
  us_equity: 'us',
  crypto_spot: 'crypto',
}

/** A 股股票挖掘 — 本地因子初选白名单 */
export const CN_EQUITY_DISCOVER_FACTORS = [
  'pe', 'pb', 'roe', 'debt_ratio', 'gross_margin', 'net_profit_yoy', 'profit_cagr_3y',
  'roe_trend', 'peg', 'momentum_1m', 'momentum_3m', 'momentum_6m', 'volume_ratio',
] as const

/** A 股 ETF 挖掘 — 本地 ETF 筛选维度 */
export const CN_ETF_DISCOVER_FACTORS = [
  'premium_rate', 'scale_yi', 'nav',
] as const

export function discoverFactorsForProfile(profile: DiscoverStrategyProfile): readonly string[] {
  switch (profile) {
    case 'cn_etf': return CN_ETF_DISCOVER_FACTORS
    case 'cn_equity':
    case 'us_equity':
      return CN_EQUITY_DISCOVER_FACTORS
    case 'crypto_spot':
      return ['momentum_1m', 'momentum_3m', 'volume_ratio']
    default:
      return CN_EQUITY_DISCOVER_FACTORS
  }
}

export function defaultDiscoverProfile(): DiscoverStrategyProfile {
  return 'cn_equity'
}

export function isDiscoverStrategyProfile(v: string): v is DiscoverStrategyProfile {
  return (DISCOVER_PROFILE_ORDER as readonly string[]).includes(v)
}

export function listDiscoverProfileMeta() {
  return DISCOVER_PROFILE_ORDER.map(id => ({
    id,
    label: DISCOVER_PROFILE_LABELS[id],
    description: DISCOVER_PROFILE_DESCRIPTIONS[id],
    requires_pack: DISCOVER_PROFILE_REQUIRES_PACK[id],
    factor_count: discoverFactorsForProfile(id).length,
    mining_ready: id === 'cn_equity' || id === 'cn_etf',
  }))
}
