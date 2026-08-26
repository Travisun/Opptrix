/** 行情失败原因 — 与 /instruments/quotes 响应 failed[].reason 契约一致 */
export type QuoteFailedReason = 'no_provider' | 'unsupported' | 'empty' | 'error' | 'not_found'

const QUOTE_FAILED_REASONS: readonly QuoteFailedReason[] = [
  'no_provider', 'unsupported', 'empty', 'error', 'not_found',
]

export function isQuoteFailedReason(v: unknown): v is QuoteFailedReason {
  return typeof v === 'string' && (QUOTE_FAILED_REASONS as readonly string[]).includes(v)
}

/**
 * 从错误文案归类失败原因：
 * - 匹配 not found（上游明确未收录，如 `Fund not found: 000001.OF`）→ 'not_found'
 * - 无可用 provider / 未启用（`没有可用的 provider` / `暂无`）→ 'no_provider'
 * - 熔断 / 冷却 / 限流（可恢复繁忙）→ 'error'（UI 用产品级「暂时繁忙」文案）
 * - 其它 → 'error'
 */
export function classifyQuoteFailureMessage(message: string): QuoteFailedReason {
  if (/not found/i.test(message)) return 'not_found'
  if (message.includes('没有可用的 provider') || message.includes('暂无')) return 'no_provider'
  // 熔断/冷却/限流：可恢复，仍归 error（勿标 no_provider，以免 UI 误导为「未配置」）
  if (/熔断|冷却|限流/.test(message)) return 'error'
  return 'error'
}
