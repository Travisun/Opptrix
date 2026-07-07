/**
 * 新浪财经上游 HTTP 错误。
 *
 * 消息中刻意不含字面 "403"，避免触发 API Key 类 Provider 的永久权限屏蔽；
 * 由引擎熔断器（recordFailure）管理生命周期，502/503 等瞬时错误冷却后自动重试。
 */
export class SinafinanceHttpError extends Error {
  readonly status: number
  /** 502/503/504/429 — 熔断冷却后可恢复 */
  readonly transient: boolean

  constructor(status: number, detail?: string) {
    const label = status === 403
      ? '访问被拒绝'
      : status === 429
        ? '请求过于频繁'
        : status >= 500
          ? '上游服务异常'
          : `请求失败 (${status})`
    super(detail ? `${label}：${detail}` : label)
    this.name = 'SinafinanceHttpError'
    this.status = status
    this.transient = status === 429 || status >= 500
  }
}

export function isSinafinanceHttpError(error: unknown): error is SinafinanceHttpError {
  return error instanceof SinafinanceHttpError
}
