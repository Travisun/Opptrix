import type { MarketDataPackConfig, MarketDataPackId } from './market-data-packs.js'
import { MARKET_PACK_LABELS } from './market-data-packs.js'
import type { MarketRegimeKind } from './market-regime.js'
import {
  DISCOVER_PROFILE_REGISTRY,
  getDiscoverProfileDefinition,
  type DiscoverPrescreenMode,
} from './discover-profile-registry.js'
import {
  type DiscoverStrategyProfile,
  DISCOVER_STRATEGY_PROFILES,
  isDiscoverStrategyProfile,
} from './discover-profile-types.js'

export type { DiscoverStrategyProfile } from './discover-profile-types.js'
export { isDiscoverStrategyProfile } from './discover-profile-types.js'

export const DISCOVER_PROFILE_ORDER: DiscoverStrategyProfile[] = DISCOVER_PROFILE_REGISTRY.map(
  row => row.id,
) as DiscoverStrategyProfile[]

export const DISCOVER_PROFILE_LABELS: Record<DiscoverStrategyProfile, string> = Object.fromEntries(
  DISCOVER_PROFILE_REGISTRY.map(row => [row.id, row.label]),
) as Record<DiscoverStrategyProfile, string>

export const DISCOVER_PROFILE_DESCRIPTIONS: Record<DiscoverStrategyProfile, string> = Object.fromEntries(
  DISCOVER_PROFILE_REGISTRY.map(row => [row.id, row.description]),
) as Record<DiscoverStrategyProfile, string>

export const DISCOVER_PROFILE_REQUIRES_PACK: Record<DiscoverStrategyProfile, MarketDataPackId | null> = Object.fromEntries(
  DISCOVER_PROFILE_REGISTRY.map(row => [row.id, row.packId]),
) as Record<DiscoverStrategyProfile, MarketDataPackId | null>

/** @deprecated A 股本地因子初选已移除；保留常量以免旧策略 JSON 解析报错 */
export const CN_EQUITY_DISCOVER_FACTORS = [
  'momentum_1m', 'momentum_3m', 'momentum_6m',
  'volume_ratio', 'volatility_20d', 'drawdown_60d',
] as const

/** A 股 ETF 挖掘 — 在线筛选维度 */
export const CN_ETF_DISCOVER_FACTORS = [
  'premium_rate', 'scale_yi', 'nav',
] as const

/** 美股挖掘 — 在线列表筛选字段 */
export const US_DISCOVER_FILTERS = [
  'keyword', 'industry_contains',
] as const

/** Crypto 挖掘 — 交易对筛选字段 */
export const CRYPTO_DISCOVER_FILTERS = [
  'keyword', 'quote', 'base_contains',
] as const

/** 区域股票挖掘 — 本地列表筛选字段（US/JP/KR 共用） */
export const REGIONAL_EQUITY_DISCOVER_FILTERS = [
  'keyword', 'industry_contains',
] as const

export function discoverFactorsForProfile(profile: DiscoverStrategyProfile): readonly string[] {
  switch (profile) {
    case 'cn_etf': return CN_ETF_DISCOVER_FACTORS
    case 'us_equity':
    case 'jp_equity':
    case 'kr_equity':
    case 'hk_equity':
      return REGIONAL_EQUITY_DISCOVER_FILTERS
    case 'crypto_spot': return CRYPTO_DISCOVER_FILTERS
    case 'cn_equity':
    default:
      return CN_EQUITY_DISCOVER_FACTORS
  }
}

export function discoverPrescreenMode(profile: DiscoverStrategyProfile): DiscoverPrescreenMode {
  return getDiscoverProfileDefinition(profile)?.prescreenMode ?? 'blocked'
}

export function defaultDiscoverProfile(): DiscoverStrategyProfile {
  return 'cn_etf'
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
  return getDiscoverProfileDefinition(profile)?.miningReady ?? false
}

export type DiscoverReadinessMode = 'local' | 'online' | 'blocked'

export interface DiscoverProfileReadinessContext {
  packs: MarketDataPackConfig
  stock_count: number
  etf_count: number
  us_count: number
  crypto_count: number
  jp_count: number
  kr_count: number
  hk_count: number
  cn_is_ready: boolean
}

function readinessCount(ctx: DiscoverProfileReadinessContext, profile: DiscoverStrategyProfile): number {
  const key = getDiscoverProfileDefinition(profile)?.readinessCountKey
  if (!key) return 0
  return ctx[key] ?? 0
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
  const def = getDiscoverProfileDefinition(profile)
  const packId = def?.packId ?? DISCOVER_PROFILE_REQUIRES_PACK[profile]

  if (packId && !ctx.packs[packId]?.enabled) {
    return {
      profile,
      ready: false,
      mode: 'blocked',
      message: packDisabledMessage(packId),
      action: packDisabledAction(packId),
    }
  }

  if (profile === 'cn_equity') {
    return {
      profile,
      ready: false,
      mode: 'blocked',
      message: 'A 股自动选股策略已移除（本地因子不可用）',
      action: '请改用 A 股 ETF / 跨市场策略，或使用 search_instruments、evaluate_instrument 等在线能力直接研究个股',
    }
  }

  if (profile === 'cn_etf') {
    return {
      profile,
      ready: true,
      mode: 'online',
      message: '将使用在线 ETF 列表与评估初选',
      action: null,
    }
  }

  const prescreen = def?.prescreenMode
  if (prescreen === 'blocked') {
    const label = DISCOVER_PROFILE_LABELS[profile]
    return {
      profile,
      ready: false,
      mode: 'blocked',
      message: def?.description ?? `${label}暂不支持自动初选`,
      action: '请直接指定标的代码进行挖掘',
    }
  }

  if (prescreen === 'list_filter') {
    const label = DISCOVER_PROFILE_LABELS[profile]
    return {
      profile,
      ready: true,
      mode: 'online',
      message: `${label}将使用在线列表初选`,
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
  if (strategyId.startsWith('jp_')) return 'jp_equity'
  if (strategyId.startsWith('kr_')) return 'kr_equity'
  if (strategyId.startsWith('hk_')) return 'hk_equity'
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

/** 美股挖掘 — 按 SPY 动量市况映射参考策略 */
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

/** 市况推荐策略 id — 按当前挖掘 Profile 过滤 */
export function resolveRegimeStrategyIds(
  profile: DiscoverStrategyProfile,
  regime: MarketRegimeKind,
  _equitySuggestedIds: string[],
): string[] {
  if (profile === 'cn_etf') return ETF_REGIME_STRATEGY_IDS[regime]
  if (profile === 'us_equity') return US_REGIME_STRATEGY_IDS[regime]
  return []
}
