/** 大附件上传：超时策略与错误文案（纯函数，便于单测）。勿抬高全局 REQUEST_TIMEOUT。 */

/** 本机重活基准（与 api/client LOCAL_HEAVY_TIMEOUT 一致）：180s */
export const ATTACHMENT_UPLOAD_BASE_TIMEOUT_MS = 180_000
/** 大文件上限：10 分钟 */
export const ATTACHMENT_UPLOAD_MAX_TIMEOUT_MS = 600_000
/** 超过该体积后按块抬高超时（20MB） */
const SIZE_STEP_BYTES = 20 * 1024 * 1024
/** 每超过一块体积额外 +30s */
const EXTRA_PER_STEP_MS = 30_000

/**
 * 按文件大小计算上传超时：基准 180s，大文件逐步抬高，上限 10 分钟。
 * 不用于普通 API（REQUEST_TIMEOUT 仍为 10s）。
 */
export function attachmentUploadTimeoutMs(byteLength: number): number {
  const size = Number.isFinite(byteLength) && byteLength > 0 ? byteLength : 0
  const over = Math.max(0, size - SIZE_STEP_BYTES)
  const steps = Math.ceil(over / SIZE_STEP_BYTES)
  return Math.min(
    ATTACHMENT_UPLOAD_MAX_TIMEOUT_MS,
    ATTACHMENT_UPLOAD_BASE_TIMEOUT_MS + steps * EXTRA_PER_STEP_MS,
  )
}

export function isAttachmentUploadAbortError(err: unknown): boolean {
  if (!(err instanceof Error)) return false
  if (err.name === 'AbortError') return true
  return /abort|已取消/i.test(err.message)
}

/** 将上传失败映射为产品级提示（用户可重试/换文件）。 */
export function formatAttachmentUploadError(
  err: unknown,
  opts?: { status?: number; code?: string; raw?: string },
): string {
  if (isAttachmentUploadAbortError(err)) {
    return '已取消添加'
  }
  const raw = (opts?.raw ?? (err instanceof Error ? err.message : '')).trim()
  const status = opts?.status
  const tooLarge = status === 413
    || opts?.code === 'FST_ERR_CTP_BODY_TOO_LARGE'
    || /payload\s*too\s*large|body\s*too\s*large|文件过大|体积过大/i.test(raw)
  if (tooLarge) {
    return '文件过大，暂时无法添加。请换较小的文件后重试'
  }
  if (/超时|timeout/i.test(raw)) {
    return '添加超时，请稍后重试；文件较大时可再试一次'
  }
  if (/network|failed to fetch|load failed|网络/i.test(raw)) {
    return '网络不稳定，暂时无法添加。请确认网络后重试'
  }
  if (raw && !/api\s*error|upload|http|status|\d{3}/i.test(raw)) {
    return raw
  }
  return '暂时无法添加该文件，请稍后重试'
}
