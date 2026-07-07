import { ProviderHttpClient } from '../../common/http-client.js'
import { HTTP_DEFAULT_HEADERS } from '../../../utils/http-shared.js'
import { TencentHttpError } from './errors.js'
import { TENCENT_REFERER } from './types.js'

const runtimeUa = process.env.OPPTRIX_HTTP_USER_AGENT?.trim()
const defaultHeaders: Record<string, string> = {
  ...HTTP_DEFAULT_HEADERS,
  Referer: TENCENT_REFERER,
  ...(runtimeUa ? { 'User-Agent': runtimeUa } : {}),
}

/** 腾讯行情中心统一 HTTP 出口 */
export const tencentHttp = new ProviderHttpClient({
  providerId: 'tencent',
  timeoutMs: 15000,
  maxRetries: 2,
  bypassRateLimit: true,
  defaultHeaders,
})

export async function fetchText(
  url: string,
  encoding: 'utf-8' | 'gbk' = 'utf-8',
): Promise<string> {
  const resp = await tencentHttp.fetch(url)
  if (!resp.ok) {
    const detail = (await resp.text().catch(() => '')).slice(0, 120)
    throw new TencentHttpError(resp.status, detail || undefined)
  }
  const buf = await resp.arrayBuffer()
  return new TextDecoder(encoding).decode(buf)
}

export async function fetchJson<T>(url: string): Promise<T> {
  return tencentHttp.get<T>(url)
}
