/**
 * 统一 Provider HTTP Client 基类
 *
 * 所有数据 Provider 的 HTTP 请求都应经过此基类。
 * 支持：自定义 header、基于主机名的智能限流、认证、重试、超时。
 *
 * 限流策略：
 * - 按主机名（hostname）独立限流，不同主机名的请求可并行
 * - 同一主机名的请求必须间隔至少 intervalMs（默认 1 秒）
 * - Provider 可配置自己的 intervalMs（如东方财富需要 2 秒）
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
    /** 最小请求间隔（毫秒），默认 1000。
     *  Provider 可根据目标 API 的反爬策略调整此值。
     *  例如：东方财富 API 需要 2 秒间隔，可设置为 2000。 */
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

/** 单个主机名的限流状态 */
interface HostThrottleState {
  /** 请求队列链 — 串行化该主机名的所有请求 */
  chain: Promise<unknown>
  /** 上一次请求完成的时间戳 */
  lastRequestAt: number
}

/**
 * 从 URL 中提取主机名
 *
 * @param url - 完整 URL 或相对路径
 * @returns 主机名，无法解析时返回 'unknown'
 */
function extractHostname(url: string): string {
  try {
    // 如果是完整 URL，直接解析
    if (url.startsWith('http://') || url.startsWith('https://')) {
      return new URL(url).hostname
    }
    // 相对路径，尝试补全协议后解析
    return new URL(`https://${url}`).hostname
  } catch {
    return 'unknown'
  }
}

/**
 * 统一 Provider HTTP Client
 *
 * 所有 Provider 的 HTTP 请求都应通过此类发起。
 * 基类提供：基于主机名的智能限流、认证、超时、重试、统一 header。
 *
 * 限流机制：
 * - 每个主机名维护独立的请求队列
 * - 同一主机名的请求严格串行，间隔至少 intervalMs
 * - 不同主机名的请求可以并行执行
 * - Provider 可通过 rateLimit.intervalMs 配置自己的间隔要求
 */
export class ProviderHttpClient {
  protected config: Required<Omit<ProviderHttpClientConfig, 'auth'>> & { auth: ProviderHttpClientConfig['auth'] }

  /** 每个主机名的限流状态 */
  private hostThrottles = new Map<string, HostThrottleState>()

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

  /**
   * 获取指定主机名的限流状态，不存在则创建
   *
   * @param hostname - 目标主机名
   * @returns 该主机名的限流状态
   */
  private getHostThrottle(hostname: string): HostThrottleState {
    let state = this.hostThrottles.get(hostname)
    if (!state) {
      state = { chain: Promise.resolve(), lastRequestAt: 0 }
      this.hostThrottles.set(hostname, state)
    }
    return state
  }

  /**
   * 基于主机名的限流执行器
   *
   * 核心逻辑：
   * 1. 从 URL 提取主机名
   * 2. 获取该主机名的独立限流状态
   * 3. 将请求排入该主机名的串行队列
   * 4. 等待直到距上次请求超过 intervalMs
   *
   * @param url - 请求 URL
   * @param fn - 实际执行请求的异步函数
   * @returns 请求结果
   */
  protected async throttle<T>(url: string, fn: () => Promise<T>): Promise<T> {
    if (!this.config.rateLimit.enabled) return fn()

    const hostname = extractHostname(url)
    const state = this.getHostThrottle(hostname)
    const intervalMs = this.config.rateLimit.intervalMs ?? 1000

    const run = state.chain.then(async () => {
      const now = Date.now()
      const waitMs = Math.max(0, intervalMs - (now - state.lastRequestAt))
      if (waitMs > 0) await sleep(waitMs)
      state.lastRequestAt = Date.now()
      return fn()
    })

    // 错误不应阻塞后续请求
    state.chain = run.then(() => undefined, () => undefined)
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
    return this.throttle(url, async () => {
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
    return this.throttle(url, async () => {
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
    return this.throttle(url, async () => {
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
    return this.throttle(url, async () => {
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
    return this.throttle(url, async () => {
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

  /**
   * 获取当前限流状态（用于调试和监控）
   *
   * @returns 各主机名的限流状态摘要
   */
  getThrottleStatus(): Record<string, { lastRequestAt: number; pendingRequests: number }> {
    const status: Record<string, { lastRequestAt: number; pendingRequests: number }> = {}
    for (const [hostname, state] of this.hostThrottles) {
      status[hostname] = {
        lastRequestAt: state.lastRequestAt,
        pendingRequests: 0, // 简化实现，实际可追踪队列长度
      }
    }
    return status
  }

  /**
   * 清理长时间未使用的主机名限流状态
   *
   * @param maxAgeMs - 最大闲置时间（毫秒），默认 5 分钟
   */
  cleanupStaleHosts(maxAgeMs = 5 * 60 * 1000): void {
    const now = Date.now()
    for (const [hostname, state] of this.hostThrottles) {
      if (now - state.lastRequestAt > maxAgeMs) {
        this.hostThrottles.delete(hostname)
      }
    }
  }
}
