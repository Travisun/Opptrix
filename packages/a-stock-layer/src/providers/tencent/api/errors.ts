/**
 * 腾讯 Provider 上游 HTTP 错误。
 */
export class TencentHttpError extends Error {
  readonly status: number
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
    this.name = 'TencentHttpError'
    this.status = status
    this.transient = status === 429 || status >= 500
  }
}

export function isTencentHttpError(error: unknown): error is TencentHttpError {
  return error instanceof TencentHttpError
}
