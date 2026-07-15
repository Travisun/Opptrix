import { isSinafinanceHttpError, SinafinanceHttpError } from './errors.js'
import { rethrowIfFreeProviderThrottleTrigger } from '../../common/free-provider-call.js'

/**
 * 多源回退：依次尝试，空结果继续下一源；HTTP 错误记录后尝试下一源。
 * 全部失败时抛出最后一个上游错误（供引擎熔断 / 免费源阶梯冷却）。
 * 封禁类错误（403/429/空响应体等）在单源失败时也会保留并最终上抛。
 */
export async function trySinafinanceSources<T>(
  attempts: Array<() => Promise<T | null>>,
): Promise<T | null> {
  let lastHttpError: SinafinanceHttpError | undefined

  for (const attempt of attempts) {
    try {
      const result = await attempt()
      if (result != null) return result
    } catch (e) {
      if (isSinafinanceHttpError(e)) {
        lastHttpError = e
        continue
      }
      throw e
    }
  }

  if (lastHttpError) throw lastHttpError
  return null
}

/**
 * 批量聚合用：非封禁类 HTTP 软失败吞为 null；封禁/限流必须上抛。
 */
export async function runSinafinancePartial<T>(
  fn: () => Promise<T>,
): Promise<T | null> {
  try {
    return await fn()
  } catch (e) {
    rethrowIfFreeProviderThrottleTrigger(e)
    if (isSinafinanceHttpError(e)) return null
    throw e
  }
}

export function rethrowIfAllFailed<T>(results: T[], lastError: SinafinanceHttpError | undefined): void {
  if (results.length || !lastError) return
  throw lastError
}
