/**
 * LLM 上游 HTTP 错误 → 聊天侧用户文案（方案 A：无 HTTP/JSON/密钥细节）。
 * 技术细节仅经 logLlmHttpError 打到服务端日志。
 */

export const LLM_ERR_BALANCE =
  '当前模型余额不足，请到服务商充值或更换模型后再试'
export const LLM_ERR_AUTH =
  '当前模型的访问密钥无效，请到设置里检查大模型配置'
export const LLM_ERR_RATE_LIMIT =
  '当前模型请求过于频繁，请稍后再试'
export const LLM_ERR_MODEL_UNAVAILABLE =
  '当前选用的模型暂时不可用，请在设置中更换后再试'
export const LLM_ERR_OVERFLOW =
  '对话内容过多，正在整理后重试…'
export const LLM_ERR_GENERIC =
  '当前模型暂时无法回复。请检查大模型配置或稍后再试'

export type LlmHttpErrorKind =
  | 'overflow'
  | 'balance'
  | 'auth'
  | 'rate_limit'
  | 'model_unavailable'
  | 'generic'

export type LlmErrorCfgHint = {
  /** 展示名 / id，勿含密钥或 URL */
  provider?: string
  model?: string
}

const BODY_LOG_MAX = 400

/** 从上游 body 抽出可读文本（含 JSON error.message），供分类用，不进聊天。 */
export function extractUpstreamErrorHaystack(bodyText: string): string {
  const raw = (bodyText ?? '').trim()
  if (!raw) return ''
  const parts: string[] = [raw]
  try {
    const parsed: unknown = JSON.parse(raw)
    collectJsonErrorStrings(parsed, parts, 0)
  } catch {
    // 非 JSON：仅用原文
  }
  return parts.join('\n')
}

function collectJsonErrorStrings(value: unknown, out: string[], depth: number): void {
  if (depth > 4 || value == null) return
  if (typeof value === 'string') {
    const t = value.trim()
    if (t) out.push(t)
    return
  }
  if (typeof value !== 'object') return
  if (Array.isArray(value)) {
    for (const item of value.slice(0, 8)) collectJsonErrorStrings(item, out, depth + 1)
    return
  }
  const rec = value as Record<string, unknown>
  for (const key of ['message', 'msg', 'error', 'code', 'type', 'detail', 'details']) {
    if (key in rec) collectJsonErrorStrings(rec[key], out, depth + 1)
  }
}

export function isContextLengthHttpError(status: number, body: string): boolean {
  const text = extractUpstreamErrorHaystack(body).toLowerCase()
  if (
    text.includes('context_length_exceeded')
    || text.includes('context length')
    || text.includes('maximum context')
    || text.includes('too many tokens')
    || text.includes('prompt is too long')
    || text.includes('token limit')
    || (text.includes('context window') && text.includes('exceed'))
  ) {
    return true
  }
  if ((status === 400 || status === 413) && (
    text.includes('token') || text.includes('context') || text.includes('length')
  )) {
    return /exceed|too (?:long|large|many)|maximum|limit/i.test(text)
  }
  return false
}

function isBalanceError(status: number, haystack: string): boolean {
  if (status === 402) return true
  const t = haystack.toLowerCase()
  return (
    t.includes('insufficient balance')
    || t.includes('insufficient_quota')
    || t.includes('insufficient quota')
    || t.includes('quota exceeded')
    || t.includes('quota_exceeded')
    || (t.includes('billing') && (t.includes('hard_limit') || t.includes('exceed')))
    || t.includes('余额不足')
    || t.includes('额度不足')
    || t.includes('欠费')
  )
}

function isAuthError(status: number, haystack: string): boolean {
  if (status === 401) return true
  const t = haystack.toLowerCase()
  return (
    t.includes('unauthorized')
    || t.includes('invalid_api_key')
    || t.includes('invalid api key')
    || t.includes('incorrect api key')
    || t.includes('authentication')
    || t.includes('鉴权失败')
    || t.includes('密钥无效')
    || t.includes('无效的密钥')
  )
}

function isRateLimitError(status: number, _haystack: string): boolean {
  return status === 429
}

function isModelUnavailableError(haystack: string): boolean {
  const t = haystack.toLowerCase()
  if (
    t.includes('model_not_found')
    || t.includes('model not found')
    || t.includes('no such model')
    || t.includes('invalid model')
    || t.includes('unknown model')
  ) {
    return true
  }
  if (t.includes('does not exist') && t.includes('model')) return true
  if (/模型.*(不存在|不可用)|不存在.*模型/.test(haystack)) return true
  return false
}

export function classifyLlmHttpError(status: number, bodyText: string): LlmHttpErrorKind {
  const haystack = extractUpstreamErrorHaystack(bodyText)
  if (isContextLengthHttpError(status, bodyText)) return 'overflow'
  if (isBalanceError(status, haystack)) return 'balance'
  if (isAuthError(status, haystack)) return 'auth'
  if (isRateLimitError(status, haystack)) return 'rate_limit'
  if (isModelUnavailableError(haystack)) return 'model_unavailable'
  return 'generic'
}

/**
 * 聊天可见文案。cfg 仅用于可选点缀模型名，永不含密钥/URL。
 */
export function formatLlmHttpUserMessage(
  status: number,
  bodyText: string,
  cfg?: LlmErrorCfgHint,
): { kind: LlmHttpErrorKind; userMessage: string; contextOverflow: boolean } {
  const kind = classifyLlmHttpError(status, bodyText)
  let userMessage: string
  switch (kind) {
    case 'overflow':
      userMessage = LLM_ERR_OVERFLOW
      break
    case 'balance':
      userMessage = LLM_ERR_BALANCE
      break
    case 'auth':
      userMessage = LLM_ERR_AUTH
      break
    case 'rate_limit':
      userMessage = LLM_ERR_RATE_LIMIT
      break
    case 'model_unavailable':
      userMessage = LLM_ERR_MODEL_UNAVAILABLE
      break
    default:
      userMessage = LLM_ERR_GENERIC
  }
  // 可选：在通用/模型不可用时带上模型名，便于用户对照设置（勿拼 URL/密钥）
  const model = cfg?.model?.trim()
  if (
    model
    && (kind === 'generic' || kind === 'model_unavailable')
    && model.length <= 64
    && !/[/:\\]/.test(model)
    && !userMessage.includes(model)
  ) {
    userMessage = `${userMessage.replace(/。$/, '')}（${model}）。`
  }
  return {
    kind,
    userMessage,
    contextOverflow: kind === 'overflow',
  }
}

/** 脱敏截断 body，供服务端日志；禁止打出疑似密钥。 */
export function sanitizeBodyForLog(bodyText: string, maxLen = BODY_LOG_MAX): string {
  let s = (bodyText ?? '').replace(/\s+/g, ' ').trim()
  s = s
    .replace(/sk-[a-zA-Z0-9_-]{8,}/gi, '[redacted]')
    .replace(/Bearer\s+[a-zA-Z0-9._\-+=/]+/gi, 'Bearer [redacted]')
    .replace(/("?(?:api[_-]?key|token|authorization)"?\s*[:=]\s*")([^"]{4,})(")/gi, '$1[redacted]$3')
  if (s.length > maxLen) s = `${s.slice(0, maxLen)}…`
  return s
}

export function logLlmHttpError(
  status: number,
  bodyText: string,
  cfg?: LlmErrorCfgHint,
): void {
  const provider = cfg?.provider?.trim() || '-'
  const model = cfg?.model?.trim() || '-'
  const body = sanitizeBodyForLog(bodyText)
  console.warn(`[llm] upstream HTTP ${status} provider=${provider} model=${model} body=${body}`)
}

/** 断言聊天文案不含技术泄漏（供单测）。 */
export function assertUserSafeLlmErrorMessage(msg: string): void {
  if (/\bHTTP\s+\d/i.test(msg) || msg.includes('HTTP ')) {
    throw new Error(`user message leaks HTTP status: ${msg}`)
  }
  if (msg.includes('{') || msg.includes('}')) {
    throw new Error(`user message looks like JSON: ${msg}`)
  }
  if (/API\s*Key/i.test(msg)) {
    throw new Error(`user message leaks API Key wording: ${msg}`)
  }
}
