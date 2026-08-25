/**
 * 数据源提供商统一排序与优先级换算。
 *
 * 展示顺序（设置页）与数据层 effectivePriority 共用同一套规则：
 * - 默认：按推荐栈 / manifestDefaultPriority（降序），同一尺度
 * - 用户拖拽后：sortOrder 成为权威顺序
 * - 仅 enabled + 密钥就绪 的源享有位置对应的优先级数值
 */

import type { ProviderSettingsField } from './provider-settings.js'

export const PROVIDER_SORT_ORDER_STEP = 10
export const PROVIDER_SORT_ORDER_BASE = 10_000
export const PROVIDER_TIER_API_KEY_BASE = 20_000
export const PROVIDER_TIER_FREE_BASE = 10_000
/** 同花顺在无用户排序时的默认置顶加成（与推荐栈首位一致；保留兼容） */
export const TONGHUASHUN_DEFAULT_PRIORITY_BOOST = 1_000

export const TONGHUASHUN_PROVIDER_ID = 'tonghuashun'

/** @deprecated 已改为同花顺置顶；保留常量以免外部引用断裂 */
export const TICKFLOW_PROVIDER_ID = 'tickflow'
/** @deprecated 使用 TONGHUASHUN_DEFAULT_PRIORITY_BOOST */
export const TICKFLOW_DEFAULT_PRIORITY_BOOST = TONGHUASHUN_DEFAULT_PRIORITY_BOOST

/**
 * 设置页 / 目录默认展示顺序（内置推荐栈）。
 * 与各 manifest `defaultPriority` 120/115/110/105/100/90 对齐。
 */
export const RECOMMENDED_PROVIDER_DISPLAY_ORDER = [
  'tonghuashun',
  'stockindex',
  'tickflow',
  'tushare',
  'binance',
  'okx',
] as const

export type RecommendedProviderId = (typeof RECOMMENDED_PROVIDER_DISPLAY_ORDER)[number]

export function providerRequiresApiKey(fields: ProviderSettingsField[]): boolean {
  return fields.some(f => f.type === 'secret' && f.required !== false)
}

export function isProviderPriorityEligible(enabled: boolean, secretsOk: boolean): boolean {
  return enabled && secretsOk
}

/** 用户拖拽顺序 → 数据层优先级（越大越优先） */
export function sortOrderToEffectivePriority(sortOrder: number): number {
  return PROVIDER_SORT_ORDER_BASE - sortOrder
}

/**
 * 无显式 sortOrder 时的展示/优先级派生 key（与 assignSortOrders 同尺度）。
 * 推荐栈内按下标；其余按 inverted manifestDefault 排在栈后。
 */
export function recommendedOrManifestSortKey(providerId: string, manifestDefault: number): number {
  const idx = (RECOMMENDED_PROVIDER_DISPLAY_ORDER as readonly string[]).indexOf(providerId)
  if (idx >= 0) return idx * PROVIDER_SORT_ORDER_STEP
  return (
    RECOMMENDED_PROVIDER_DISPLAY_ORDER.length * PROVIDER_SORT_ORDER_STEP
    + (1_000_000 - manifestDefault)
  )
}

/**
 * 无用户排序时的默认优先级。
 * 与 sortOrder 路径共用同一换算，避免「仅部分源有 sortOrder」时量级错乱。
 */
export function defaultManifestTierPriority(
  providerId: string,
  _requiresApiKey: boolean,
  manifestDefault: number,
): number {
  return sortOrderToEffectivePriority(recommendedOrManifestSortKey(providerId, manifestDefault))
}

export interface ProviderOrderSortable {
  providerId: string
  title: string
  sortOrder: number | null
  requiresApiKey: boolean
  manifestDefaultPriority: number
}

/** 无显式 sortOrder 时，用推荐栈下标或 inverted priority 派生可比 key */
export function derivedProviderDisplaySortKey(p: ProviderOrderSortable): number {
  if (p.sortOrder != null) return p.sortOrder
  return recommendedOrManifestSortKey(p.providerId, p.manifestDefaultPriority)
}

export function compareDefaultProviderOrder(a: ProviderOrderSortable, b: ProviderOrderSortable): number {
  const ka = derivedProviderDisplaySortKey(a)
  const kb = derivedProviderDisplaySortKey(b)
  if (ka !== kb) return ka - kb

  if (a.manifestDefaultPriority !== b.manifestDefaultPriority) {
    return b.manifestDefaultPriority - a.manifestDefaultPriority
  }

  return a.title.localeCompare(b.title, 'zh-CN')
}

export function sortProvidersForCatalog<T extends ProviderOrderSortable>(providers: T[]): T[] {
  return providers.slice().sort(compareDefaultProviderOrder)
}

export function assignSortOrders(providerIds: string[]): Array<{ providerId: string; sortOrder: number }> {
  return providerIds.map((providerId, index) => ({
    providerId,
    sortOrder: index * PROVIDER_SORT_ORDER_STEP,
  }))
}

export function computeEffectiveRanks(
  providers: Array<{ providerId: string; priorityEligible: boolean }>,
): Map<string, number> {
  let rank = 0
  const map = new Map<string, number>()
  for (const p of providers) {
    if (!p.priorityEligible) continue
    rank += 1
    map.set(p.providerId, rank)
  }
  return map
}
