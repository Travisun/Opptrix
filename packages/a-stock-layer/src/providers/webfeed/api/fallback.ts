import { isWebfeedHttpError, WebfeedHttpError } from './errors.js'

/**
 * 多源回退：依次尝试，空结果继续下一源；HTTP 错误记录后尝试下一源。
 * 全部失败时抛出最后一个上游错误（供引擎熔断），无 HTTP 错误则返回 null（空数据）。
 */
export async function tryWebfeedSources<T>(
  attempts: Array<() => Promise<T | null>>,
): Promise<T | null> {
  let lastHttpError: WebfeedHttpError | undefined

  for (const attempt of attempts) {
    try {
      const result = await attempt()
      if (result != null) return result
    } catch (e) {
      if (isWebfeedHttpError(e)) {
        lastHttpError = e
        continue
      }
      throw e
    }
  }

  if (lastHttpError) throw lastHttpError
  return null
}

/** 批量聚合：单源失败不中断，最终无结果且无 HTTP 错误返回 null */
export async function runWebfeedPartial<T>(
  fn: () => Promise<T>,
): Promise<T | null> {
  try {
    return await fn()
  } catch (e) {
    if (isWebfeedHttpError(e)) return null
    throw e
  }
}

export function rethrowIfAllFailed<T>(results: T[], lastError: WebfeedHttpError | undefined): void {
  if (results.length || !lastError) return
  throw lastError
}
