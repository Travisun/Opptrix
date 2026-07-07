import { ProviderHttpClient } from '../../common/http-client.js'
import { HTTP_DEFAULT_HEADERS } from '../../../utils/http-shared.js'
import { SinafinanceHttpError } from './errors.js'
import { SINA_REFERER } from './types.js'

/** 代用户浏览：桌面端优先 Electron 会话 UA，否则使用项目默认 Chrome UA */
const runtimeUa = process.env.OPPTRIX_HTTP_USER_AGENT?.trim()
const sinafinanceDefaultHeaders: Record<string, string> = {
  ...HTTP_DEFAULT_HEADERS,
  Referer: SINA_REFERER,
  ...(runtimeUa ? { 'User-Agent': runtimeUa } : {}),
}

/** 网络补充源统一 HTTP 出口 — 429/5xx 重试 + 超时；不限主机名间隔（由引擎负载/熔断调度） */
export const sinafinanceHttp = new ProviderHttpClient({
  providerId: 'sinafinance',
  timeoutMs: 15000,
  maxRetries: 2,
  bypassRateLimit: true,
  defaultHeaders: sinafinanceDefaultHeaders,
})

export async function fetchText(
  url: string,
  encoding: 'utf-8' | 'gbk' = 'utf-8',
  referer: string = SINA_REFERER,
): Promise<string> {
  const headers: Record<string, string> = { Referer: referer }

  const resp = await sinafinanceHttp.fetch(url, { headers })
  if (!resp.ok) {
    const detail = (await resp.text().catch(() => '')).slice(0, 120)
    throw new SinafinanceHttpError(resp.status, detail || undefined)
  }
  const buf = await resp.arrayBuffer()
  return new TextDecoder(encoding).decode(buf)
}

export async function fetchJson<T>(url: string, referer: string = SINA_REFERER): Promise<T> {
  return sinafinanceHttp.get<T>(url, undefined, { extraHeaders: { Referer: referer } })
}

/** 下载二进制（PDF 公告附件等） */
export async function fetchBinary(
  url: string,
  referer: string = SINA_REFERER,
): Promise<Buffer> {
  const headers: Record<string, string> = { Referer: referer }
  const resp = await sinafinanceHttp.fetch(url, { headers })
  if (!resp.ok) {
    const detail = (await resp.text().catch(() => '')).slice(0, 120)
    throw new SinafinanceHttpError(resp.status, detail || undefined)
  }
  const buf = await resp.arrayBuffer()
  return Buffer.from(buf)
}
