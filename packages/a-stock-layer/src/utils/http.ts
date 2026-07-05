/**
 * HTTP 工具层 — 封装 fetch 请求，提供重试、超时、退避策略。
 *
 * 用途：所有数据 Provider 的底层 HTTP 通信。
 * 特性：
 *   - 自动重试 429/5xx（指数退避 + Retry-After 头解析）
 *   - 请求超时控制（默认 15s）
 *   - 统一 User-Agent / Referer 头
 *   - 支持 GET/POST JSON/Form 多种格式
 */

export const HTTP_DEFAULT_HEADERS = {
  'User-Agent': (
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) '
    + 'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  ),
  Accept: 'application/json, text/plain, */*',
  'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
  Referer: 'https://quote.eastmoney.com/',
}

/** 需要重试的 HTTP 状态码 */
const RETRY_STATUS = new Set([429, 500, 502, 503, 504])

/** 异步休眠指定毫秒 */
export function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * 构造自在量化 API 鉴权请求头。
 * @param token 自在量化 API Token（sdk-key）
 * @returns 包含 `sdk-key` 的请求头对象，token 为空时返回空对象
 */
export function sdkKeyHeaders(token: string): Record<string, string> {
  const key = token.trim()
  return key ? { 'sdk-key': key } : {}
}

/**
 * HTTP 响应包装 — 统一 fetch Response 接口，便于测试与 mock。
 *
 * 用途：所有 HTTP 工具函数的返回类型，调用方可直接读取 status、调用 json()/text()。
 */
export interface HttpFetchResponse {
  /** HTTP 状态码（200、401、429 等） */
  status: number
  /** 原始响应头 */
  headers: Headers
  /** 解析响应体为 JSON */
  json(): Promise<Record<string, unknown>>
  /** 读取响应体为纯文本 */
  text(): Promise<string>
}

/**
 * GET 请求 + 429 退避重试 — 解析 Retry-After 头 + 指数退避。
 *
 * 用途：自在量化（Zzshare）等需要处理速率限制的 API。
 * 特性：返回原始 status，调用方可自行处理 401/429 而不抛异常。
 *
 * @param url      请求 URL
 * @param params   URL 查询参数（自动序列化）
 * @param options  可选配置：timeoutMs（超时，默认 15s）、extraHeaders、maxRetries（最大重试，默认 3）
 */
export async function httpGetWithRetry(
  url: string,
  params: Record<string, string> = {},
  options: {
    timeoutMs?: number
    extraHeaders?: Record<string, string>
    maxRetries?: number
  } = {},
): Promise<HttpFetchResponse> {
  const timeoutMs = options.timeoutMs ?? 15000
  const maxRetries = options.maxRetries ?? 3
  const headers = { ...HTTP_DEFAULT_HEADERS, ...options.extraHeaders }
  const qs = new URLSearchParams(params)
  const fullUrl = qs.toString() ? `${url}?${qs}` : url

  let retries = 0
  let backoff = 2

  while (true) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const resp = await fetch(fullUrl, { headers, signal: controller.signal })
      if (resp.status === 429) {
        retries += 1
        if (retries > maxRetries) return wrapFetchResponse(resp)
        const retryAfter = resp.headers.get('Retry-After')
        let sleepTime = backoff
        if (retryAfter) {
          const parsed = Number.parseFloat(retryAfter)
          sleepTime = Number.isFinite(parsed) ? parsed + 0.5 : backoff
          if (!Number.isFinite(parsed)) backoff *= 2
        } else {
          backoff *= 2
        }
        await sleep(sleepTime * 1000)
        continue
      }
      return wrapFetchResponse(resp)
    } catch (e) {
      if (retries >= maxRetries) throw e instanceof Error ? e : new Error(String(e))
      retries += 1
      await sleep(backoff * 1000)
      backoff *= 2
    } finally {
      clearTimeout(timer)
    }
  }
}

function wrapFetchResponse(resp: Response): HttpFetchResponse {
  return {
    status: resp.status,
    headers: resp.headers,
    json: () => resp.json() as Promise<Record<string, unknown>>,
    text: () => resp.text(),
  }
}

/**
 * GET 请求 + 重试（简化版）— 无 Retry-After 解析，固定退避。
 *
 * 用途：东方财富、巨潮等通用 API 调用。
 * 特性：自动重试 3 次，处理 JSON/HTML 响应格式。
 *
 * @param url            请求 URL
 * @param params         URL 查询参数
 * @param timeoutMs      超时时间（毫秒），默认 15000
 * @param extraHeaders   额外请求头
 */
export async function httpGet(
  url: string,
  params: Record<string, string>,
  timeoutMs = 15000,
  extraHeaders: Record<string, string> = {},
) {
  const qs = new URLSearchParams(params)
  const fullUrl = `${url}?${qs}`
  let lastError = ''
  const headers = { ...HTTP_DEFAULT_HEADERS, ...extraHeaders }

  for (let attempt = 0; attempt < 3; attempt++) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const resp = await fetch(fullUrl, { headers, signal: controller.signal })
      if (!resp.ok) {
        if (RETRY_STATUS.has(resp.status) && attempt < 2) {
          await sleep(1000 * (attempt + 1))
          continue
        }
        throw new Error(`HTTP ${resp.status}`)
      }
      const ct = resp.headers.get('content-type') ?? ''
      if (ct.includes('json')) return resp.json() as Promise<Record<string, unknown>>
      const text = await resp.text()
      if (text.trimStart().startsWith('<')) throw new Error('HTML response')
      try {
        return JSON.parse(text) as Record<string, unknown>
      } catch {
        throw new Error('Invalid JSON')
      }
    } catch (e) {
      lastError = String(e)
      if (attempt < 2) {
        await sleep(1000 * (attempt + 1))
        continue
      }
    } finally {
      clearTimeout(timer)
    }
  }
  throw new Error(lastError || 'request failed')
}

/**
 * GET 请求返回纯文本（HTML 等非 JSON 响应）。
 *
 * 用途：巨潮资讯 HTML 公告页面、同花顺热力图等。
 *
 * @param url            请求 URL
 * @param extraHeaders   额外请求头
 * @param timeoutMs      超时时间（毫秒），默认 15000
 */
export async function httpGetText(
  url: string,
  extraHeaders: Record<string, string> = {},
  timeoutMs = 15000,
): Promise<string> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const resp = await fetch(url, {
      headers: { ...HTTP_DEFAULT_HEADERS, ...extraHeaders },
      signal: controller.signal,
    })
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
    return resp.text()
  } finally {
    clearTimeout(timer)
  }
}

/**
 * POST application/json 请求 — 发送 JSON 体，返回 JSON 响应。
 *
 * 用途：巨潮资讯公告查询 POST、东方财富筛选接口等。
 *
 * @param url            请求 URL
 * @param body           请求体（自动 JSON 序列化）
 * @param extraHeaders   额外请求头
 * @param timeoutMs      超时时间（毫秒），默认 15000
 */
export async function httpPost(
  url: string,
  body: unknown,
  extraHeaders: Record<string, string> = {},
  timeoutMs = 15000,
): Promise<Record<string, unknown>> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        ...HTTP_DEFAULT_HEADERS,
        'Content-Type': 'application/json',
        ...extraHeaders,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
    return resp.json() as Promise<Record<string, unknown>>
  } finally {
    clearTimeout(timer)
  }
}

/**
 * POST application/x-www-form-urlencoded 请求 — 发送表单体，返回 JSON 响应。
 *
 * 用途：东方财富资金流向等需要 form-urlencoded 格式的接口。
 *
 * @param url            请求 URL
 * @param data           表单键值对（自动 URL 编码）
 * @param extraHeaders   额外请求头
 * @param timeoutMs      超时时间（毫秒），默认 15000
 */
export async function httpPostForm(
  url: string,
  data: Record<string, string>,
  extraHeaders: Record<string, string> = {},
  timeoutMs = 15000,
): Promise<Record<string, unknown>> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        ...HTTP_DEFAULT_HEADERS,
        'Content-Type': 'application/x-www-form-urlencoded',
        ...extraHeaders,
      },
      body: new URLSearchParams(data),
      signal: controller.signal,
    })
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
    return resp.json() as Promise<Record<string, unknown>>
  } finally {
    clearTimeout(timer)
  }
}
