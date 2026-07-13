/**
 * 直连 Provider 方法时的统一守卫（供 Hub 详情页兜底等绕过 queryScoped 的路径使用）。
 */
import { getProviderHealthTracker } from './provider-health.js'
import {
  recordProviderQueryEmpty,
  recordProviderQueryError,
  recordProviderQuerySuccess,
  shouldSkipProviderQuery,
} from './free-provider-throttle.js'

export async function invokeProviderDriverMethod<T>(
  providerId: string,
  capabilityKey: string,
  fn: () => Promise<T[] | null | undefined>,
): Promise<T[] | null> {
  const health = getProviderHealthTracker()
  const skip = shouldSkipProviderQuery(providerId, capabilityKey, health)
  if (skip.skip) return null

  try {
    const data = await fn()
    if (!data?.length) {
      recordProviderQueryEmpty(providerId, capabilityKey, health)
      return null
    }
    recordProviderQuerySuccess(providerId, capabilityKey, health)
    return data
  } catch (e) {
    recordProviderQueryError(providerId, capabilityKey, e, health)
    return null
  }
}
