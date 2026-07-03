import type { Market } from './market-data.js'
import type { MarketDataPackId } from './market-data-packs.js'

/** 市场实现阶段 — 用于横向扩展（日韩等） */
export type MarketImplementationPhase = 'live' | 'partial' | 'planned'

export interface MarketDefinition {
  id: Market
  label: string
  /** 关联本地数据包；null 表示无独立 pack（如 HK 可挂 cn 或独立 jp pack） */
  packId: MarketDataPackId | null
  phase: MarketImplementationPhase
  /** 默认 discover profile（若已实现） */
  defaultDiscoverProfile?: string
  notes?: string
}

/** 规划中的市场（尚未加入 Market 联合类型） */
export type PlannedMarketId = 'JP' | 'KR'

export interface PlannedMarketDefinition {
  id: PlannedMarketId
  label: string
  packId: string
  phase: 'planned'
  notes?: string
}

export const MARKET_REGISTRY: MarketDefinition[] = [
  {
    id: 'CN',
    label: 'A 股',
    packId: 'cn',
    phase: 'live',
    defaultDiscoverProfile: 'cn_equity',
    notes: '完整因子库、scorecard、t-strategy、行业挖掘',
  },
  {
    id: 'US',
    label: '美股',
    packId: 'us',
    phase: 'live',
    defaultDiscoverProfile: 'us_equity',
    notes: '列表 + 在线 snapshot/kline；无本地因子 prescreen',
  },
  {
    id: 'HK',
    label: '港股',
    packId: null,
    phase: 'partial',
    notes: 'InstrumentRef / 关注列表已支持；Provider 与 discover 待接入',
  },
  {
    id: 'CRYPTO',
    label: 'Crypto',
    packId: 'crypto',
    phase: 'live',
    defaultDiscoverProfile: 'crypto_spot',
    notes: '7×24 行情；列表筛选 + Agent 挖掘',
  },
]

export const PLANNED_MARKET_REGISTRY: PlannedMarketDefinition[] = [
  {
    id: 'JP',
    label: '日本股市',
    packId: 'jp',
    phase: 'planned',
    notes: '建议 MVP：instruments + quotes + list_filter discover，复用 US 模式',
  },
  {
    id: 'KR',
    label: '韩国股市',
    packId: 'kr',
    phase: 'planned',
    notes: '建议 MVP：同 JP；需 KRX 代码 normalizer 与交易日历',
  },
]

export function getMarketDefinition(market: Market): MarketDefinition | undefined {
  return MARKET_REGISTRY.find(m => m.id === market)
}

export function listLiveMarkets(): Market[] {
  return MARKET_REGISTRY.filter(m => m.phase === 'live').map(m => m.id)
}

export function marketPackId(market: Market): MarketDataPackId | null {
  return getMarketDefinition(market)?.packId ?? null
}
