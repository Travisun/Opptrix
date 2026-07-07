import { ProviderHttpClient } from '../../common/http-client.js'
import { HTTP_DEFAULT_HEADERS } from '../../../utils/http-shared.js'
import { WebfeedHttpError } from './errors.js'

/** 代用户浏览：桌面端优先 Electron 会话 UA，否则使用项目默认 Chrome UA */
const runtimeUa = process.env.OPPTRIX_HTTP_USER_AGENT?.trim()
const webfeedDefaultHeaders: Record<string, string> = {
  ...HTTP_DEFAULT_HEADERS,
  ...(runtimeUa ? { 'User-Agent': runtimeUa } : {}),
}

/** 网络补充源统一 HTTP 出口 — 429/5xx 重试 + 超时；不限主机名间隔（由引擎负载/熔断调度） */
export const webfeedHttp = new ProviderHttpClient({
  providerId: 'webfeed',
  timeoutMs: 15000,
  maxRetries: 2,
  bypassRateLimit: true,
  defaultHeaders: webfeedDefaultHeaders,
})

export async function fetchText(
  url: string,
  encoding: 'utf-8' | 'gbk' = 'utf-8',
  referer?: string,
): Promise<string> {
  const headers: Record<string, string> = {}
  if (referer) headers.Referer = referer

  const resp = await webfeedHttp.fetch(url, { headers })
  if (!resp.ok) {
    const detail = (await resp.text().catch(() => '')).slice(0, 120)
    throw new WebfeedHttpError(resp.status, detail || undefined)
  }
  const buf = await resp.arrayBuffer()
  return new TextDecoder(encoding).decode(buf)
}

export async function fetchJson<T>(url: string, referer?: string): Promise<T> {
  if (referer) {
    return webfeedHttp.get<T>(url, undefined, { extraHeaders: { Referer: referer } })
  }
  return webfeedHttp.get<T>(url)
}
