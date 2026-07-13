/**
 * 统一 Provider HTTP Client
 *
 * 所有数据 Provider 的对外 HTTP 请求都应通过此类发起。
 *
 * 核心能力：
 * 1. 全局主机名限流 — 同一主机名请求间隔 >= 1s，不同主机名并行
 * 2. 429/5xx 自动重试 — 指数退避 + Retry-After 头解析
 * 3. 请求超时控制 — AbortController + 可配置超时
 * 4. 统一 Header / 认证 — Provider 级别默认配置
 *
 * 设计目标：ProviderHttpClient 是唯一的对外请求出口。
 */

import { HTTP_DEFAULT_HEADERS, sleep } from '../../utils/http-shared.js'
import { hostnameLimiter, extractHostname } from './rate-limiter.js'
import {
  FREE_PROVIDER_EMPTY_BODY_REASON,
  isEmptyHttpResponseBody,
  outboundFetch,
} from '@opptrix/shared'

/** 需要重试的 HTTP 状态码 */
const RETRY_STATUS = new Set([429, 500, 502, 503, 504])

export interface ProviderHttpClientConfig {
  providerId: string
  defaultHeaders?: Record<string, string>
  timeoutMs?: number
  maxRetries?: number
  /** 跳过主机名限流 — 付费 API（如 tushare/tickflow）无需等待间隔 */
  bypassRateLimit?: boolean
  auth?: {
    type: 'header' | 'query'
    key: string
    value: string
  }
}

/**
 * 统一 Provider HTTP Client
 *
 * 请求流程：
 *   acquire(hostname)  → 重试循环 → release(hostname)
 *   限流器保证同主机名间隔，重试循环处理 429/5xx 退避
 */
export class ProviderHttpClient {
  protected config: Required<Omit<ProviderHttpClientConfig, 'auth'>> & { auth: ProviderHttpClientConfig['auth'] }

  constructor(config: ProviderHttpClientConfig) {
    this.config = {
      providerId: config.providerId,
      defaultHeaders: config.defaultHeaders ?? { ...HTTP_DEFAULT_HEADERS },
      timeoutMs: config.timeoutMs ?? 15000,
      maxRetries: config.maxRetries ?? 3,
      bypassRateLimit: config.bypassRateLimit ?? false,
      auth: config.auth,
    }
  }

  protected getHeaders(extraHeaders?: Record<string, string>): Record<string, string> {
    const headers = { ...this.config.defaultHeaders, ...extraHeaders }
    if (this.config.auth?.type === 'header' && this.config.auth.key) {
      headers[this.config.auth.key] = this.config.auth.value
    }
    return headers
  }

  protected getParams(params: Record<string, string>): Record<string, string> {
    const result = { ...params }
    if (this.config.auth?.type === 'query' && this.config.auth.key) {
      result[this.config.auth.key] = this.config.auth.value
    }
    return result
  }

  /**
   * 通过全局限流器执行请求
   *
   * 限流器负责：acquire → fn() → release
   * fn() 内部可包含重试逻辑，限流器不感知重试
   */
  private async throttled<T>(url: string, fn: () => Promise<T>): Promise<T> {
    if (this.config.bypassRateLimit) return fn()
    const hostname = extractHostname(url)
    return hostnameLimiter.acquireWith(hostname, fn)
  }

  /**
   * 带重试的原始 fetch
   *
   * 429 → 解析 Retry-After 头 + 指数退避
   * 5xx → 固定退避重试
   * 网络错误 → 指数退避重试
   */
  private async fetchWithRetry(
    url: string,
    init: RequestInit,
    timeoutMs: number,
  ): Promise<Response> {
    const maxRetries = this.config.maxRetries
    let retries = 0
    let backoff = 2

    while (true) {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), timeoutMs)
      try {
        const resp = await outboundFetch(url, { ...init, signal: controller.signal })

        if (resp.status === 429) {
          retries += 1
          if (retries > maxRetries) return resp
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

        return resp
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

  // ──────────────────────────────────────────────────────────
  // 公开 API — 所有 Provider 统一调用这些方法
  // ──────────────────────────────────────────────────────────

  /**
   * GET 请求（返回 JSON）
   *
   * 流程：限流 → 构建 URL/Header → 带重试 fetch → 解析 JSON
   */
  async get<T = Record<string, unknown>>(
    url: string,
    params?: Record<string, string>,
    options?: { timeoutMs?: number; extraHeaders?: Record<string, string> },
  ): Promise<T> {
    return this.throttled(url, async () => {
      const qs = new URLSearchParams(this.getParams(params ?? {}))
      const fullUrl = qs.toString() ? `${url}?${qs}` : url
      const headers = this.getHeaders(options?.extraHeaders)
      const timeout = options?.timeoutMs ?? this.config.timeoutMs

      const resp = await this.fetchWithRetry(fullUrl, { headers }, timeout)
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)

      const ct = resp.headers.get('content-type') ?? ''
      const text = await resp.text()
      if (isEmptyHttpResponseBody(text)) {
        throw new Error(FREE_PROVIDER_EMPTY_BODY_REASON)
      }
      if (ct.includes('json')) return JSON.parse(text) as T
      if (text.trimStart().startsWith('<')) throw new Error('HTML response')
      return JSON.parse(text) as T
    })
  }

  /**
   * GET 请求（返回文本）
   */
  async getText(
    url: string,
    options?: { timeoutMs?: number; extraHeaders?: Record<string, string> },
  ): Promise<string> {
    return this.throttled(url, async () => {
      const headers = this.getHeaders(options?.extraHeaders)
      const timeout = options?.timeoutMs ?? this.config.timeoutMs
      const resp = await this.fetchWithRetry(url, { headers }, timeout)
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
      const text = await resp.text()
      if (isEmptyHttpResponseBody(text)) {
        throw new Error(FREE_PROVIDER_EMPTY_BODY_REASON)
      }
      return text
    })
  }

  /**
   * POST 请求（JSON body，返回 JSON）
   */
  async post<T = Record<string, unknown>>(
    url: string,
    body: unknown,
    options?: { timeoutMs?: number; extraHeaders?: Record<string, string> },
  ): Promise<T> {
    return this.throttled(url, async () => {
      const headers = {
        ...this.getHeaders(options?.extraHeaders),
        'Content-Type': 'application/json',
      }
      const timeout = options?.timeoutMs ?? this.config.timeoutMs
      const resp = await this.fetchWithRetry(
        url,
        { method: 'POST', headers, body: JSON.stringify(body) },
        timeout,
      )
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
      const text = await resp.text()
      if (isEmptyHttpResponseBody(text)) {
        throw new Error(FREE_PROVIDER_EMPTY_BODY_REASON)
      }
      return JSON.parse(text) as T
    })
  }

  /**
   * POST 请求（Form body，返回 JSON）
   */
  async postForm<T = Record<string, unknown>>(
    url: string,
    data: Record<string, string>,
    options?: { timeoutMs?: number; extraHeaders?: Record<string, string> },
  ): Promise<T> {
    return this.throttled(url, async () => {
      const headers = {
        ...this.getHeaders(options?.extraHeaders),
        'Content-Type': 'application/x-www-form-urlencoded',
      }
      const timeout = options?.timeoutMs ?? this.config.timeoutMs
      const resp = await this.fetchWithRetry(
        url,
        { method: 'POST', headers, body: new URLSearchParams(data) },
        timeout,
      )
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
      const text = await resp.text()
      if (isEmptyHttpResponseBody(text)) {
        throw new Error(FREE_PROVIDER_EMPTY_BODY_REASON)
      }
      return JSON.parse(text) as T
    })
  }

  /**
   * 原始 fetch（用于流式响应、二进制数据等特殊场景）
   */
  async fetch(
    url: string,
    init?: RequestInit & { timeoutMs?: number },
  ): Promise<Response> {
    return this.throttled(url, async () => {
      const timeout = init?.timeoutMs ?? this.config.timeoutMs
      const headers = this.getHeaders(init?.headers as Record<string, string>)
      return this.fetchWithRetry(url, { ...init, headers }, timeout)
    })
  }

  /** 获取全局限流状态（调试用） */
  getThrottleStatus() {
    return hostnameLimiter.status()
  }
}
