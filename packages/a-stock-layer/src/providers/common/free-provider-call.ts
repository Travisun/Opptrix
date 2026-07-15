/**
 * 免费源调用守卫 — handler 吞错为 null 时，仍须把封禁/限流信号上抛给引擎。
 *
 * 引擎侧 `recordProviderQueryError` + `isFreeProviderThrottleTrigger` 会写入阶梯冷却；
 * 业务空结果返回 null 走 soft fail / failover，不进入长冷却。
 */

import { isFreeProviderThrottleTrigger } from '@opptrix/shared'

/** 若错误匹配免费源封禁/限流特征，原样上抛；否则静默返回（供 catch 后 return null） */
export function rethrowIfFreeProviderThrottleTrigger(error: unknown): void {
  if (isFreeProviderThrottleTrigger(error).trigger) throw error
}

/**
 * 执行 Provider 方法：业务/网络软错误 → null；封禁类 → 抛出。
 */
export async function nullUnlessThrottleTrigger<T>(
  fn: () => Promise<T | null | undefined>,
): Promise<T | null> {
  try {
    const value = await fn()
    return value ?? null
  } catch (e) {
    rethrowIfFreeProviderThrottleTrigger(e)
    return null
  }
}
