/**
 * 统一 Provider HTTP Client 基类
 *
 * 所有数据 Provider 的 HTTP 请求都应经过此基类。
 *
 * 限流策略：
 * - 使用全局 HostnameRateLimiter 单例，所有 Provider 共享
 * - 同一主机名请求间隔 >= 1s（默认），不同主机名完全并行
 * - 限流与重试解耦：限流器只管调度，重试在 httpGet 内部处理
 *
 * 认证与 Header：
 * - Provider 可配置默认 header、认证 token
 * - 每次请求可传入额外 header 覆盖
 */

import { HTTP_DEFAULT_HEADERS, httpGet, httpGetText, httpPost, httpPostForm } from '../../utils/http.js'
import { hostnameLimiter, extractHostname } from './rate-limiter.js'

export interface ProviderHttpClientConfig {
  providerId: string
  defaultHeaders?: Record<string, string>
  timeoutMs?: number
  auth?: {
    type: 'header' | 'query'
    key: string
    value: string
  }
}

/**
 * 统一 Provider HTTP Client
 *
 * 职责：
 * 1. 统一 header / 认证 / 超时
 * 2. 通过全局限流器保护目标服务器
 * 3. 不处理重试 — 重试由底层 httpGet 负责
 */
export class ProviderHttpClient {
  protected config: Required<Omit<ProviderHttpClientConfig, 'auth'>> & { auth: ProviderHttpClientConfig['auth'] }

  constructor(config: ProviderHttpClientConfig) {
    this.config = {
      providerId: config.providerId,
      defaultHeaders: config.defaultHeaders ?? { ...HTTP_DEFAULT_HEADERS },
      timeoutMs: config.timeoutMs ?? 15000,
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
   * 流程：acquire → fn() → release
   * 无论 fn 成功失败，release 都会执行。
   */
  private async throttled<T>(url: string, fn: () => Promise<T>): Promise<T> {
    const hostname = extractHostname(url)
    return hostnameLimiter.acquireWith(hostname, fn)
  }

  async get<T = Record<string, unknown>>(
    url: string,
    params?: Record<string, string>,
    options?: { timeoutMs?: number; extraHeaders?: Record<string, string> },
  ): Promise<T> {
    return this.throttled(url, async () => {
      const allParams = this.getParams(params ?? {})
      const headers = this.getHeaders(options?.extraHeaders)
      const timeout = options?.timeoutMs ?? this.config.timeoutMs
      return httpGet(url, allParams, timeout, headers) as Promise<T>
    })
  }

  async getText(
    url: string,
    options?: { timeoutMs?: number; extraHeaders?: Record<string, string> },
  ): Promise<string> {
    return this.throttled(url, async () => {
      const headers = this.getHeaders(options?.extraHeaders)
      const timeout = options?.timeoutMs ?? this.config.timeoutMs
      return httpGetText(url, headers, timeout)
    })
  }

  async post<T = Record<string, unknown>>(
    url: string,
    body: unknown,
    options?: { timeoutMs?: number; extraHeaders?: Record<string, string> },
  ): Promise<T> {
    return this.throttled(url, async () => {
      const headers = this.getHeaders(options?.extraHeaders)
      const timeout = options?.timeoutMs ?? this.config.timeoutMs
      return httpPost(url, body, headers, timeout) as Promise<T>
    })
  }

  async postForm<T = Record<string, unknown>>(
    url: string,
    data: Record<string, string>,
    options?: { timeoutMs?: number; extraHeaders?: Record<string, string> },
  ): Promise<T> {
    return this.throttled(url, async () => {
      const headers = this.getHeaders(options?.extraHeaders)
      const timeout = options?.timeoutMs ?? this.config.timeoutMs
      return httpPostForm(url, data, headers, timeout) as Promise<T>
    })
  }

  async fetch(
    url: string,
    init?: RequestInit & { timeoutMs?: number },
  ): Promise<Response> {
    return this.throttled(url, async () => {
      const timeout = init?.timeoutMs ?? this.config.timeoutMs
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), timeout)
      try {
        const headers = this.getHeaders(init?.headers as Record<string, string>)
        return await globalThis.fetch(url, { ...init, headers, signal: controller.signal })
      } finally {
        clearTimeout(timer)
      }
    })
  }
}
