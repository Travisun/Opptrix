/**
 * HTTP 工具层 — 所有 Provider 的底层 HTTP 通信入口。
 *
 * 所有函数内部委托给全局 ProviderHttpClient 实例，
 * 自动获得：主机名限流（>=1s）、429/5xx 重试、超时控制。
 *
 * 新代码应直接使用 ProviderHttpClient 实例。
 * 本模块保留是为了向后兼容现有 Provider 调用。
 */

import { ProviderHttpClient } from '../providers/common/http-client.js'

/** 全局默认 HTTP Client — 所有 httpGet/httpPost 等函数委托给它 */
const defaultClient = new ProviderHttpClient({ providerId: 'builtin' })

export const HTTP_DEFAULT_HEADERS = {
  'User-Agent': (
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) '
    + 'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  ),
  Accept: 'application/json, text/plain, */*',
  'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
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
  return defaultClient.get(url, params, { timeoutMs, extraHeaders })
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
  return defaultClient.getText(url, { timeoutMs, extraHeaders })
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
  return defaultClient.post(url, body, { timeoutMs, extraHeaders })
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
  return defaultClient.postForm(url, data, { timeoutMs, extraHeaders })
}
