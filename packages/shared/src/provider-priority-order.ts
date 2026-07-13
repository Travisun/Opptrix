/**
 * 数据源提供商统一排序与优先级换算。
 *
 * 展示顺序（设置页）与数据层 effectivePriority 共用同一套规则：
 * - 默认：TickFlow 最前；其余需 API Key 的靠上；免费源靠后
 * - 用户拖拽后：sortOrder 成为权威顺序
 * - 仅 enabled + 密钥就绪 的源享有位置对应的优先级数值
 */

import type { ProviderSettingsField } from './provider-settings.js'

export const PROVIDER_SORT_ORDER_STEP = 10
export const PROVIDER_SORT_ORDER_BASE = 10_000
export const PROVIDER_TIER_API_KEY_BASE = 20_000
export const PROVIDER_TIER_FREE_BASE = 10_000
/** TickFlow 在无用户排序时的默认置顶加成 */
export const TICKFLOW_DEFAULT_PRIORITY_BOOST = 1_000

export const TICKFLOW_PROVIDER_ID = 'tickflow'

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

/** 无用户排序时的分层默认优先级 */
export function defaultManifestTierPriority(
  providerId: string,
  requiresApiKey: boolean,
  manifestDefault: number,
): number {
  if (!requiresApiKey) {
    return PROVIDER_TIER_FREE_BASE + manifestDefault
  }
  if (providerId === TICKFLOW_PROVIDER_ID) {
    return PROVIDER_TIER_API_KEY_BASE + TICKFLOW_DEFAULT_PRIORITY_BOOST
  }
  return PROVIDER_TIER_API_KEY_BASE + manifestDefault
}

export interface ProviderOrderSortable {
  providerId: string
  title: string
  sortOrder: number | null
  requiresApiKey: boolean
  manifestDefaultPriority: number
}

export function compareDefaultProviderOrder(a: ProviderOrderSortable, b: ProviderOrderSortable): number {
  if (a.sortOrder != null && b.sortOrder != null && a.sortOrder !== b.sortOrder) {
    return a.sortOrder - b.sortOrder
  }
  if (a.sortOrder != null && b.sortOrder == null) return -1
  if (a.sortOrder == null && b.sortOrder != null) return 1

  if (a.providerId === TICKFLOW_PROVIDER_ID && b.providerId !== TICKFLOW_PROVIDER_ID) return -1
  if (b.providerId === TICKFLOW_PROVIDER_ID && a.providerId !== TICKFLOW_PROVIDER_ID) return 1

  if (a.requiresApiKey !== b.requiresApiKey) {
    return a.requiresApiKey ? -1 : 1
  }

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
