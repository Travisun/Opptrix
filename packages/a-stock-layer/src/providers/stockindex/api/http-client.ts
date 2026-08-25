/**
 * OpptrixQuant HTTP 客户端 — https://quant.opptrix.net
 *
 * 认证：`X-API-Key` 请求头（付费源，`bypassRateLimit: true`）。
 * 未配置 API Key 时 `fromConfig()` 返回 null（对齐 TickflowClient.fromConfig）。
 * 429（日/月配额）在重试耗尽后解析 `{ error: { code, message } }`，带上游 message 抛出。
 */
import { ProviderHttpClient } from '../../common/http-client.js'
import { stockIndexApiKey, stockIndexBaseUrl } from '../settings.js'

export class OpptrixQuantApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly code?: string,
  ) {
    super(message)
    this.name = 'OpptrixQuantApiError'
  }
}

/** 解析上游错误体 `{ error: { code, message } }`；非 JSON 时返回空 */
function parseErrorBody(body: string): { code?: string; message?: string } {
  try {
    const parsed = JSON.parse(body) as { error?: { code?: string; message?: string } }
    return {
      code: parsed?.error?.code,
      message: parsed?.error?.message,
    }
  } catch {
    return {}
  }
}

export class StockIndexHttpClient extends ProviderHttpClient {
  private readonly baseUrl: string

  private constructor(apiKey: string, baseUrl: string) {
    super({
      providerId: 'stockindex',
      bypassRateLimit: true,
      timeoutMs: 30_000,
      maxRetries: 3,
      defaultHeaders: { Accept: 'application/json' },
      auth: { type: 'header', key: 'X-API-Key', value: apiKey },
    })
    this.baseUrl = baseUrl.replace(/\/$/, '')
  }

  /** 未配置 API Key 时返回 null */
  static fromConfig(): StockIndexHttpClient | null {
    const apiKey = stockIndexApiKey()
    if (!apiKey) return null
    return new StockIndexHttpClient(apiKey, stockIndexBaseUrl())
  }

  private url(path: string): string {
    return path.startsWith('http') ? path : `${this.baseUrl}${path}`
  }

  private errorFrom(status: number, body: string): OpptrixQuantApiError {
    const { code, message } = parseErrorBody(body)
    if (status === 429) {
      return new OpptrixQuantApiError(
        message ? `Opptrix量化 配额已用尽：${message}` : 'Opptrix量化 配额已用尽，请稍后再试',
        status,
        code,
      )
    }
    return new OpptrixQuantApiError(
      message ? `Opptrix量化暂时不可用（${status}）：${message}` : `Opptrix量化暂时不可用（${status}）`,
      status,
      code,
    )
  }

  private async requestJson<T>(
    path: string,
    init?: RequestInit & { timeoutMs?: number },
  ): Promise<T> {
    const resp = await this.fetch(this.url(path), init)
    const text = await resp.text()
    if (!resp.ok) throw this.errorFrom(resp.status, text)
    if (!text.trim()) throw new OpptrixQuantApiError('Opptrix量化返回空响应，请稍后重试', resp.status)
    return JSON.parse(text) as T
  }

  async get<T>(path: string, params?: Record<string, string | undefined>): Promise<T> {
    const qs = new URLSearchParams()
    for (const [k, v] of Object.entries(params ?? {})) {
      if (v != null && v !== '') qs.set(k, v)
    }
    const url = qs.toString() ? `${this.url(path)}?${qs}` : this.url(path)
    return this.requestJson<T>(url)
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    return this.requestJson<T>(this.url(path), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  }
}
