/**
 * AKShare HTTP Client — 统一管理所有 AKShare 数据接口的 HTTP 请求。
 *
 * 数据来源：多个外部网站（东方财富、新浪、中基协、集思录、猫眼、胡润等）
 * 特性：统一限流、统一 header、统一错误处理
 */

import { ProviderHttpClient } from '../../common/http-client.js'
import { rethrowIfFreeProviderThrottleTrigger } from '../../common/free-provider-call.js'

/** AKShare 默认请求头 */
const AKSHARE_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Referer: 'https://data.eastmoney.com/',
}

/**
 * AKShare HTTP Client
 *
 * 所有 AKShare 数据接口的 HTTP 请求都应通过此类发起。
 * 默认限流间隔 1 秒，防止触发各网站反爬机制。
 */
export class AkshareHttpClient extends ProviderHttpClient {
  constructor() {
    super({
      providerId: 'akshare',
      defaultHeaders: AKSHARE_HEADERS,
      bypassRateLimit: false,
    })
  }

  /**
   * 获取数据（带重试）
   *
   * @param url - 请求 URL
   * @param params - 查询参数
   * @returns JSON 响应，失败返回 null；封禁/限流错误上抛
   */
  async getOrNull<T = Record<string, unknown>>(
    url: string,
    params?: Record<string, string>,
    options?: { timeoutMs?: number; extraHeaders?: Record<string, string> },
  ): Promise<T | null> {
    try {
      return await this.get<T>(url, params, options)
    } catch (e) {
      rethrowIfFreeProviderThrottleTrigger(e)
      return null
    }
  }

  /**
   * 获取 HTML 文本（用于解析网页）
   *
   * @param url - 请求 URL
   * @param extraHeaders - 额外请求头
   * @returns HTML 文本，失败返回 null；封禁/限流错误上抛
   */
  async getHtmlOrNull(
    url: string,
    extraHeaders?: Record<string, string>,
  ): Promise<string | null> {
    try {
      return await this.getText(url, { extraHeaders })
    } catch (e) {
      rethrowIfFreeProviderThrottleTrigger(e)
      return null
    }
  }

  /**
   * POST JSON 请求（返回数组）
   *
   * @param url - 请求 URL
   * @param body - 请求体
   * @returns 数据数组，失败返回 null；封禁/限流错误上抛
   */
  async postArrayOrNull<T = Record<string, unknown>>(
    url: string,
    body: Record<string, unknown>,
    options?: { timeoutMs?: number; extraHeaders?: Record<string, string> },
  ): Promise<T[] | null> {
    try {
      const json = await this.post<{ datas?: T[] }>(url, body, {
        extraHeaders: { 'Content-Type': 'application/json' },
        ...options,
      })
      return json?.datas ?? null
    } catch (e) {
      rethrowIfFreeProviderThrottleTrigger(e)
      return null
    }
  }
}

/** 全局 AKShare HTTP Client 实例 */
export const akshareClient = new AkshareHttpClient()
