/**
 * 统一 Provider HTTP Client 基类
 *
 * 所有数据 Provider 的 HTTP 请求都应经过此基类。
 * 支持：自定义 header、限流控制、认证、重试、超时。
 */

import { HTTP_DEFAULT_HEADERS, sleep, httpGet, httpGetText, httpPost, httpPostForm } from '../../utils/http.js'

/** HTTP Client 配置 */
export interface ProviderHttpClientConfig {
  /** Provider ID，用于日志和错误追踪 */
  providerId: string
  /** 默认请求头 */
  defaultHeaders?: Record<string, string>
  /** 请求超时时间（毫秒），默认 15000 */
  timeoutMs?: number
  /** 限流配置 */
  rateLimit?: {
    /** 是否启用限流，默认 true */
    enabled: boolean
    /** 最小请求间隔（毫秒），默认 1000 */
    intervalMs?: number
  }
  /** 认证配置 */
  auth?: {
    /** Token 类型：header（放入请求头）| query（放入查询参数） */
    type: 'header' | 'query'
    /** Token 名称（如 'Authorization'、'api_key'） */
    key: string
    /** Token 值，支持环境变量读取 */
    value: string
  }
}

/**
 * 统一 Provider HTTP Client
 *
 * 所有 Provider 的 HTTP 请求都应通过此类发起。
 * 基类提供：限流、认证、超时、重试、统一 header。
 */
export class ProviderHttpClient {
  protected config: Required<Omit<ProviderHttpClientConfig, 'auth'>> & { auth: ProviderHttpClientConfig['auth'] }
  private chain: Promise<unknown> = Promise.resolve()
  private lastRequestAt = 0

  constructor(config: ProviderHttpClientConfig) {
    this.config = {
      providerId: config.providerId,
      defaultHeaders: config.defaultHeaders ?? { ...HTTP_DEFAULT_HEADERS },
      timeoutMs: config.timeoutMs ?? 15000,
      rateLimit: {
        enabled: config.rateLimit?.enabled ?? true,
        intervalMs: config.rateLimit?.intervalMs ?? 1000,
      },
      auth: config.auth,
    }
  }

  /** 获取带认证的请求头 */
  protected getHeaders(extraHeaders?: Record<string, string>): Record<string, string> {
    const headers = { ...this.config.defaultHeaders, ...extraHeaders }
    if (this.config.auth?.type === 'header' && this.config.auth.key) {
      headers[this.config.auth.key] = this.config.auth.value
    }
    return headers
  }

  /** 获取带认证的查询参数 */
  protected getParams(params: Record<string, string>): Record<string, string> {
    const result = { ...params }
    if (this.config.auth?.type === 'query' && this.config.auth.key) {
      result[this.config.auth.key] = this.config.auth.value
    }
    return result
  }

  /** 限流执行器 */
  protected async throttle<T>(fn: () => Promise<T>): Promise<T> {
    if (!this.config.rateLimit.enabled) return fn()

    const run = this.chain.then(async () => {
      const now = Date.now()
      const intervalMs = this.config.rateLimit.intervalMs ?? 1000
      const waitMs = Math.max(0, intervalMs - (now - this.lastRequestAt))
      if (waitMs > 0) await sleep(waitMs)
      this.lastRequestAt = Date.now()
      return fn()
    })
    this.chain = run.then(() => undefined, () => undefined)
    return run
  }

  /**
   * GET 请求（返回 JSON）
   *
   * @param url - 请求 URL
   * @param params - 查询参数
   * @param options - 可选配置
   * @returns JSON 响应
   */
  async get<T = Record<string, unknown>>(
    url: string,
    params?: Record<string, string>,
    options?: { timeoutMs?: number; extraHeaders?: Record<string, string> },
  ): Promise<T> {
    return this.throttle(async () => {
      const allParams = this.getParams(params ?? {})
      const headers = this.getHeaders(options?.extraHeaders)
      const timeout = options?.timeoutMs ?? this.config.timeoutMs
      return httpGet(url, allParams, timeout, headers) as Promise<T>
    })
  }

  /**
   * GET 请求（返回文本）
   *
   * @param url - 请求 URL
   * @param options - 可选配置
   * @returns 文本响应
   */
  async getText(
    url: string,
    options?: { timeoutMs?: number; extraHeaders?: Record<string, string> },
  ): Promise<string> {
    return this.throttle(async () => {
      const headers = this.getHeaders(options?.extraHeaders)
      const timeout = options?.timeoutMs ?? this.config.timeoutMs
      return httpGetText(url, headers, timeout)
    })
  }

  /**
   * POST 请求（JSON body，返回 JSON）
   *
   * @param url - 请求 URL
   * @param body - 请求体
   * @param options - 可选配置
   * @returns JSON 响应
   */
  async post<T = Record<string, unknown>>(
    url: string,
    body: unknown,
    options?: { timeoutMs?: number; extraHeaders?: Record<string, string> },
  ): Promise<T> {
    return this.throttle(async () => {
      const headers = this.getHeaders(options?.extraHeaders)
      const timeout = options?.timeoutMs ?? this.config.timeoutMs
      return httpPost(url, body, headers, timeout) as Promise<T>
    })
  }

  /**
   * POST 请求（Form body，返回 JSON）
   *
   * @param url - 请求 URL
   * @param data - 表单数据
   * @param options - 可选配置
   * @returns JSON 响应
   */
  async postForm<T = Record<string, unknown>>(
    url: string,
    data: Record<string, string>,
    options?: { timeoutMs?: number; extraHeaders?: Record<string, string> },
  ): Promise<T> {
    return this.throttle(async () => {
      const headers = this.getHeaders(options?.extraHeaders)
      const timeout = options?.timeoutMs ?? this.config.timeoutMs
      return httpPostForm(url, data, headers, timeout) as Promise<T>
    })
  }

  /**
   * 原始 fetch 请求（用于特殊场景，如流式响应）
   *
   * @param url - 请求 URL
   * @param init - fetch 配置
   * @returns Response 对象
   */
  async fetch(
    url: string,
    init?: RequestInit & { timeoutMs?: number },
  ): Promise<Response> {
    return this.throttle(async () => {
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
