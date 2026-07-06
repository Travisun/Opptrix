/**
 * 统一 Provider HTTP Client 基类
 *
 * 所有数据 Provider 的 HTTP 请求都应经过此基类。
 * 支持：自定义 header、基于主机名的智能限流、认证、重试、超时。
 *
 * 限流策略（按主机名）：
 * - 若该主机名无请求在进行中，且距上次完成已超过 intervalMs → 立即执行
 * - 若有请求在进行中 → 等待其完成后，再判断间隔
 * - 不同主机名的请求完全并行，互不影响
 */

import { HTTP_DEFAULT_HEADERS, sleep, httpGet, httpGetText, httpPost, httpPostForm } from '../../utils/http.js'

export interface ProviderHttpClientConfig {
  providerId: string
  defaultHeaders?: Record<string, string>
  timeoutMs?: number
  rateLimit?: {
    enabled: boolean
    /** 同一主机名两次请求的最小间隔（毫秒），默认 1000 */
    intervalMs?: number
  }
  auth?: {
    type: 'header' | 'query'
    key: string
    value: string
  }
}

/**
 * 单个主机名的限流状态
 *
 * 设计要点：
 * - inFlight: 标记是否有请求正在执行，排队者需要等它结束
 * - lastCompletedAt: 上一次请求 **完成**（成功或失败）的时间戳
 * - waiters: 当 inFlight=true 时，新请求加入此队列等待
 */
interface HostThrottleState {
  inFlight: boolean
  lastCompletedAt: number
  waiters: Array<() => void>
}

function extractHostname(url: string): string {
  try {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      return new URL(url).hostname
    }
    return new URL(`https://${url}`).hostname
  } catch {
    return 'unknown'
  }
}

/**
 * 统一 Provider HTTP Client
 *
 * 限流核心逻辑：
 *
 *   请求到达 ──→ 有请求在飞？
 *                  ├─ 否 → 距上次完成 >= intervalMs？
 *                  │         ├─ 是 → 直接执行，标记 inFlight=true
 *                  │         └─ 否 → sleep(剩余时间) → 执行
 *                  └─ 是 → 加入 waiters 排队
 *                              └─ 当前请求完成时 → 逐个唤醒 waiters
 */
export class ProviderHttpClient {
  protected config: Required<Omit<ProviderHttpClientConfig, 'auth'>> & { auth: ProviderHttpClientConfig['auth'] }
  private hostStates = new Map<string, HostThrottleState>()

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

  private getState(hostname: string): HostThrottleState {
    let s = this.hostStates.get(hostname)
    if (!s) {
      s = { inFlight: false, lastCompletedAt: 0, waiters: [] }
      this.hostStates.set(hostname, s)
    }
    return s
  }

  /**
   * 基于主机名的智能限流
   *
   * 关键区分：
   *   空闲路径 — 无请求在飞，直接执行（可能需要补足间隔等待）
   *   忙碌路径 — 有请求在飞，排队等候，当前请求完成后依次唤醒
   *
   * 无论哪条路径，fn() 的异常都不会污染状态机：
   *   - 成功：lastCompletedAt = Date.now()
   *   - 失败：lastCompletedAt = Date.now()（失败也算"完成"，防止错误风暴）
   */
  protected async throttle<T>(url: string, fn: () => Promise<T>): Promise<T> {
    if (!this.config.rateLimit.enabled) return fn()

    const hostname = extractHostname(url)
    const state = this.getState(hostname)
    const intervalMs = this.config.rateLimit.intervalMs ?? 1000

    // ── 空闲路径：无请求在飞 ──
    if (!state.inFlight) {
      const elapsed = Date.now() - state.lastCompletedAt
      if (elapsed >= intervalMs) {
        // 间隔已够，直接跑
        return this.executeTracked(state, fn)
      }
      // 间隔不够，补齐等待后执行
      return new Promise<T>((resolve) => {
        const timer = setTimeout(async () => {
          resolve(await this.executeTracked(state, fn))
        }, intervalMs - elapsed)
        // 若在等待期间又有新请求进来，它们会走忙碌路径排队
      })
    }

    // ── 忙碌路径：有请求在飞，排队等候 ──
    return new Promise<T>((resolve, reject) => {
      const waiter = async () => {
        // 被唤醒时，距上次完成可能还不够 intervalMs，再补一次
        const gap = Date.now() - state.lastCompletedAt
        if (gap < intervalMs) {
          await sleep(intervalMs - gap)
        }
        try {
          resolve(await this.executeTracked(state, fn))
        } catch (err) {
          reject(err)
        }
      }
      state.waiters.push(waiter)
    })
  }

  /**
   * 执行请求并管理 inFlight 状态
   *
   * 流程：标记 inFlight → 执行 fn → 更新 lastCompletedAt → 唤醒下一个 waiters
   * 无论 fn 成功或失败，都会推进状态机，不会卡死队列。
   */
  private async executeTracked<T>(state: HostThrottleState, fn: () => Promise<T>): Promise<T> {
    state.inFlight = true
    try {
      const result = await fn()
      return result
    } finally {
      state.lastCompletedAt = Date.now()
      state.inFlight = false
      // 唤醒队列中的下一个等待者
      const next = state.waiters.shift()
      if (next) next()
    }
  }

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

  /** 调试用：各主机名的限流快照 */
  getThrottleStatus(): Record<string, { inFlight: boolean; lastCompletedAt: number; waiting: number }> {
    const out: Record<string, { inFlight: boolean; lastCompletedAt: number; waiting: number }> = {}
    for (const [host, s] of this.hostStates) {
      out[host] = { inFlight: s.inFlight, lastCompletedAt: s.lastCompletedAt, waiting: s.waiters.length }
    }
    return out
  }

  /** 清理长时间未访问的主机名状态 */
  cleanupStaleHosts(maxAgeMs = 5 * 60 * 1000): void {
    const now = Date.now()
    for (const [host, s] of this.hostStates) {
      if (!s.inFlight && now - s.lastCompletedAt > maxAgeMs) {
        this.hostStates.delete(host)
      }
    }
  }
}
