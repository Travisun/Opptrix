import type { MarketDataPackConfig, MarketDataPackId } from './market-data-packs.js'
import { MARKET_PACK_LABELS } from './market-data-packs.js'
import type { MarketRegimeKind } from './market-regime.js'

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

/** 美股挖掘 — 本地列表筛选字段 */
export const US_DISCOVER_FILTERS = [
  'keyword', 'industry_contains',
] as const

/** Crypto 挖掘 — 本地交易对筛选字段 */
export const CRYPTO_DISCOVER_FILTERS = [
  'keyword', 'quote', 'base_contains',
] as const

export function discoverFactorsForProfile(profile: DiscoverStrategyProfile): readonly string[] {
  switch (profile) {
    case 'cn_etf': return CN_ETF_DISCOVER_FACTORS
    case 'us_equity': return US_DISCOVER_FILTERS
    case 'crypto_spot': return CRYPTO_DISCOVER_FILTERS
    case 'cn_equity':
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
    mining_ready: isDiscoverProfileMiningReady(id),
  }))
}

export function isDiscoverProfileMiningReady(profile: DiscoverStrategyProfile): boolean {
  return profile === 'cn_equity'
    || profile === 'cn_etf'
    || profile === 'us_equity'
    || profile === 'crypto_spot'
}

export type DiscoverReadinessMode = 'local' | 'online' | 'blocked'

export interface DiscoverProfileReadinessContext {
  packs: MarketDataPackConfig
  stock_count: number
  etf_count: number
  us_count: number
  crypto_count: number
  cn_is_ready: boolean
}

export interface DiscoverProfileReadiness {
  profile: DiscoverStrategyProfile
  ready: boolean
  mode: DiscoverReadinessMode
  message: string
  action: string | null
}

function packDisabledMessage(pack: MarketDataPackId): string {
  return `${MARKET_PACK_LABELS[pack]}数据包未开启`
}

function packDisabledAction(pack: MarketDataPackId): string {
  return `请前往 设置 → 市场数据，开启「${MARKET_PACK_LABELS[pack]}」并完成数据准备`
}

/** 挖掘前数据包 / 本地库门禁（纯函数，供 Hub 与 Agent 共用） */
export function assessDiscoverProfileReadiness(
  profile: DiscoverStrategyProfile,
  ctx: DiscoverProfileReadinessContext,
): DiscoverProfileReadiness {
  const packId = DISCOVER_PROFILE_REQUIRES_PACK[profile]

  if (packId && !ctx.packs[packId].enabled) {
    return {
      profile,
      ready: false,
      mode: 'blocked',
      message: packDisabledMessage(packId),
      action: packDisabledAction(packId),
    }
  }

  if (profile === 'cn_equity') {
    if (ctx.cn_is_ready) {
      return {
        profile,
        ready: true,
        mode: 'local',
        message: '本地因子库已就绪，将使用本地初选',
        action: null,
      }
    }
    return {
      profile,
      ready: true,
      mode: 'online',
      message: '本地因子库未完全就绪，初选将在线扫描（耗时更长）',
      action: '建议前往 设置 → 市场数据 完成 A 股同步，以加速挖掘',
    }
  }

  if (profile === 'cn_etf') {
    if (ctx.etf_count < 1) {
      return {
        profile,
        ready: false,
        mode: 'blocked',
        message: '本地尚无 ETF 数据，无法初选',
        action: '请前往 设置 → 市场数据，完成 ETF 列表与净值同步（etf_list / etf_nav）',
      }
    }
    return {
      profile,
      ready: true,
      mode: 'local',
      message: `本地 ETF ${ctx.etf_count} 只，将按决策雷达评分初选`,
      action: null,
    }
  }

  if (profile === 'us_equity') {
    if (ctx.us_count < 1) {
      return {
        profile,
        ready: false,
        mode: 'blocked',
        message: '本地尚无美股列表',
        action: packDisabledAction('us'),
      }
    }
    return {
      profile,
      ready: true,
      mode: 'local',
      message: `本地美股 ${ctx.us_count} 只，将按列表筛选初选`,
      action: null,
    }
  }

  if (profile === 'crypto_spot') {
    if (ctx.crypto_count < 1) {
      return {
        profile,
        ready: false,
        mode: 'blocked',
        message: '本地尚无 Crypto 交易对列表',
        action: packDisabledAction('crypto'),
      }
    }
    return {
      profile,
      ready: true,
      mode: 'local',
      message: `本地 Crypto ${ctx.crypto_count} 对，将按交易对筛选初选`,
      action: null,
    }
  }

  return {
    profile,
    ready: false,
    mode: 'blocked',
    message: '暂不支持该资产类型挖掘',
    action: null,
  }
}

export function assessAllDiscoverProfileReadiness(
  ctx: DiscoverProfileReadinessContext,
): DiscoverProfileReadiness[] {
  return DISCOVER_PROFILE_ORDER.map(profile => assessDiscoverProfileReadiness(profile, ctx))
}

/** 内置策略 id → Profile（自编策略以存储的 profile 为准） */
export function inferBuiltinStrategyProfile(strategyId: string): DiscoverStrategyProfile {
  if (strategyId.startsWith('etf_')) return 'cn_etf'
  if (strategyId.startsWith('us_')) return 'us_equity'
  if (strategyId.startsWith('crypto_')) return 'crypto_spot'
  return 'cn_equity'
}

/** A 股 ETF 挖掘 — 按指数市况映射的参考策略（宽基配置视角） */
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

/** 市况推荐策略 id — 按当前挖掘 Profile 过滤 */
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
