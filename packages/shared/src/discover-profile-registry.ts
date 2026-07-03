import type { MarketDataPackId } from './pack-registry.js'
import type { DiscoverStrategyProfile } from './discover-profile-types.js'
import type { ScorecardProfile } from './scorecard-registry.js'

/** 初选执行模式 — DiscoverRunner 路由依据 */
export type DiscoverPrescreenMode =
  | 'factor_screen'
  | 'etf_screen'
  | 'list_filter'
  | 'blocked'

/** Agent 挖掘阶段开放的工具组 */
export type DiscoverMiningToolGroup =
  | 'cn_equity_full'
  | 'cn_etf'
  | 'us_equity'
  | 'crypto_spot'
  | 'jp_equity'
  | 'kr_equity'
  | 'hk_equity'
  | 'none'

export interface DiscoverProfileDefinition {
  id: DiscoverStrategyProfile
  label: string
  description: string
  packId: MarketDataPackId | null
  prescreenMode: DiscoverPrescreenMode
  scorecardProfile: ScorecardProfile | null
  miningToolGroup: DiscoverMiningToolGroup
  miningReady: boolean
  regimeAware: boolean
  readinessCountKey: 'stock_count' | 'etf_count' | 'us_count' | 'crypto_count' | 'jp_count' | 'kr_count' | 'hk_count' | null
  strategyIdPrefix: string | null
  /** list_filter 使用的 hub local screen feature */
  localScreenFeature?: string
}

export const DISCOVER_PROFILE_REGISTRY: DiscoverProfileDefinition[] = [
  {
    id: 'cn_equity',
    label: 'A 股股票',
    description: '全 A 股票池 · 本地因子库初选与 AI 精选',
    packId: 'cn',
    prescreenMode: 'factor_screen',
    scorecardProfile: 'cn_equity',
    miningToolGroup: 'cn_equity_full',
    miningReady: true,
    regimeAware: true,
    readinessCountKey: 'stock_count',
    strategyIdPrefix: null,
  },
  {
    id: 'cn_etf',
    label: 'A 股 ETF',
    description: 'ETF 折溢价、规模与同类对比 · 决策雷达',
    packId: 'cn',
    prescreenMode: 'etf_screen',
    scorecardProfile: 'cn_etf',
    miningToolGroup: 'cn_etf',
    miningReady: true,
    regimeAware: true,
    readinessCountKey: 'etf_count',
    strategyIdPrefix: 'etf_',
  },
  {
    id: 'us_equity',
    label: '美股',
    description: '美股本地列表筛选（需开启美股数据包）',
    packId: 'us',
    prescreenMode: 'list_filter',
    scorecardProfile: null,
    miningToolGroup: 'us_equity',
    miningReady: true,
    regimeAware: false,
    readinessCountKey: 'us_count',
    strategyIdPrefix: 'us_',
    localScreenFeature: 'local_us_screen',
  },
  {
    id: 'crypto_spot',
    label: 'Crypto',
    description: 'Crypto 交易对筛选（需开启 Crypto 数据包）',
    packId: 'crypto',
    prescreenMode: 'list_filter',
    scorecardProfile: null,
    miningToolGroup: 'crypto_spot',
    miningReady: true,
    regimeAware: false,
    readinessCountKey: 'crypto_count',
    strategyIdPrefix: 'crypto_',
    localScreenFeature: 'local_crypto_screen',
  },
  {
    id: 'jp_equity',
    label: '日本股市',
    description: '日股本地列表筛选（需开启日本数据包）',
    packId: 'jp',
    prescreenMode: 'list_filter',
    scorecardProfile: null,
    miningToolGroup: 'jp_equity',
    miningReady: true,
    regimeAware: false,
    readinessCountKey: 'jp_count',
    strategyIdPrefix: 'jp_',
    localScreenFeature: 'local_jp_screen',
  },
  {
    id: 'kr_equity',
    label: '韩国股市',
    description: '韩股本地列表筛选（需开启韩国数据包）',
    packId: 'kr',
    prescreenMode: 'list_filter',
    scorecardProfile: null,
    miningToolGroup: 'kr_equity',
    miningReady: true,
    regimeAware: false,
    readinessCountKey: 'kr_count',
    strategyIdPrefix: 'kr_',
    localScreenFeature: 'local_kr_screen',
  },
  {
    id: 'hk_equity',
    label: '港股',
    description: '港股本地列表筛选（需开启港股数据包）',
    packId: 'hk',
    prescreenMode: 'list_filter',
    scorecardProfile: null,
    miningToolGroup: 'hk_equity',
    miningReady: true,
    regimeAware: false,
    readinessCountKey: 'hk_count',
    strategyIdPrefix: 'hk_',
    localScreenFeature: 'local_hk_screen',
  },
]

export function getDiscoverProfileDefinition(
  profile: DiscoverStrategyProfile,
): DiscoverProfileDefinition | undefined {
  return DISCOVER_PROFILE_REGISTRY.find(row => row.id === profile)
}

export function inferDiscoverProfileFromStrategyId(strategyId: string): DiscoverStrategyProfile {
  for (const row of DISCOVER_PROFILE_REGISTRY) {
    if (row.strategyIdPrefix && strategyId.startsWith(row.strategyIdPrefix)) {
      return row.id
    }
  }
  return 'cn_equity'
}

export function listDiscoverProfileIds(): DiscoverStrategyProfile[] {
  return DISCOVER_PROFILE_REGISTRY.map(row => row.id)
}
